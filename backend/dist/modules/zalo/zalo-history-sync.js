/**
 * zalo-history-sync.ts — Đồng bộ lịch sử tin nhắn Zalo về CRM.
 * (Bản tối ưu hóa hiệu suất và chống Rate Limit)
 */
import { prisma } from "../../shared/database/prisma-client.js";
import { logger } from "../../shared/utils/logger.js";
import { randomUUID } from "node:crypto";
import { detectContentType } from "./zalo-message-helpers.js";
const THREAD_TYPE_USER = 0;
const THREAD_TYPE_GROUP = 1;
// --- TỐI ƯU HÓA: Thay đổi các hằng số cấu hình ---
const DELAY_MIN_MS = 1000; // Nghỉ tối thiểu 1s (Chống Zalo ban)
const DELAY_MAX_MS = 2500; // Nghỉ tối đa 2.5s
const BATCH_TIMEOUT_MS = 15000; // Chờ 1 batch tối đa 15s
const THREAD_TIMEOUT_MS = 300000; // 5 phút tối đa cho 1 người/nhóm
const MAX_PAGES = 100;
const MAX_RETRIES = 3; // Số lần thử lại nếu rớt mạng/timeout
// Hàm sleep với thời gian ngẫu nhiên để giống người thật (Anti-bot)
function sleepRandom() {
    const ms = Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS + 1)) +
        DELAY_MIN_MS;
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
// ─────────────────────────────────────────────────────────────────────────────
// Hàm chính
// ─────────────────────────────────────────────────────────────────────────────
export async function syncHistoryForAccount(accountId, api, orgId, io, socketId) {
    const result = {
        totalThreads: 0,
        totalMessages: 0,
        skipped: 0,
        errors: 0,
    };
    const emitProgress = (msg, percent) => {
        const target = socketId ? io?.to(socketId) : io;
        target?.emit("history:progress", { accountId, message: msg, percent });
        logger.info(`[history-sync:${accountId}] ${msg}`);
    };
    emitProgress("Đang lấy danh sách bạn bè...", 2);
    let friends = [];
    try {
        const raw = await api.getAllFriends(20000);
        friends = Array.isArray(raw)
            ? raw
            : raw && typeof raw === "object"
                ? Object.values(raw)
                : [];
    }
    catch (err) {
        logger.warn(`[history-sync] getAllFriends error:`, err);
    }
    const friendMap = new Map();
    for (const f of friends) {
        const uid = String(f.userId || f.uid || f.id || "");
        if (!uid)
            continue;
        const name = f.zaloName ||
            f.zalo_name ||
            f.displayName ||
            f.display_name ||
            f.name ||
            "";
        friendMap.set(uid, { name: name || "", avatar: f.avatar || "" });
    }
    emitProgress("Đang lấy danh sách nhóm...", 5);
    let groupIds = [];
    try {
        const groupsRes = await api.getAllGroups();
        groupIds = Object.keys(groupsRes?.gridVerMap || {});
    }
    catch (err) {
        logger.warn(`[history-sync] getAllGroups error:`, err);
    }
    result.totalThreads = friends.length + groupIds.length;
    // ── 1. Sync DM (tin nhắn 1-1) ────────────────────────────────────────────
    let dmDone = 0;
    for (const friend of friends) {
        const uid = String(friend.userId || friend.uid || friend.id || "");
        if (!uid) {
            dmDone++;
            continue;
        }
        try {
            const friendInfo = friendMap.get(uid) || { name: "Unknown", avatar: "" };
            // Đảm bảo Contact & Conversation tồn tại TRƯỚC khi chạy vòng lặp (Tối ưu DB)
            const { contactId, convId } = await ensureContactAndConversation(orgId, accountId, uid, friendInfo.name, friendInfo.avatar, uid, false);
            let dmSaved = 0;
            let lastMsgId = null;
            let page = 0;
            const threadStart = Date.now();
            while (page < MAX_PAGES) {
                if (Date.now() - threadStart > THREAD_TIMEOUT_MS) {
                    logger.warn(`[history-sync] DM ${uid} timeout an toàn sau ${page} pages`);
                    break; // Quá 5 phút thì chủ động nhả ra
                }
                const msgs = await collectBatchWithRetry(api.listener, THREAD_TYPE_USER, lastMsgId, uid);
                if (msgs.length === 0)
                    break; // Thật sự hết tin nhắn
                // LƯU DB HÀNG LOẠT (BULK INSERT)
                const savedCount = await bulkSaveMessages(msgs, convId, friendMap);
                dmSaved += savedCount;
                result.skipped += msgs.length - savedCount;
                const oldest = getOldestMsgId(msgs);
                if (!oldest || oldest === lastMsgId)
                    break;
                lastMsgId = oldest;
                page++;
                await sleepRandom(); // Chống Rate limit
            }
            result.totalMessages += dmSaved;
        }
        catch (err) {
            logger.error(`[history-sync] DM ${uid} error:`, err);
            result.errors++;
        }
        dmDone++;
        emitProgress(`DM [${dmDone}/${friends.length}]`, Math.round(10 + (dmDone / (friends.length || 1)) * 20));
    }
    // ── 2. Sync Groups ────────────────────────────────────────────────────────
    let groupDone = 0;
    for (const groupId of groupIds) {
        try {
            let groupName = groupId;
            const memberNameMap = new Map();
            try {
                const gInfoRes = await api.getGroupInfo(groupId);
                const gInfo = gInfoRes?.gridInfoMap?.[groupId];
                if (gInfo) {
                    groupName = gInfo.name || groupId;
                    for (const mem of gInfo.currentMems || []) {
                        const memId = String(mem.id || "");
                        const memName = (mem.zaloName || mem.dName || "").trim();
                        if (memId && memName)
                            memberNameMap.set(memId, memName);
                    }
                }
            }
            catch (e) { }
            const combinedMap = new Map([
                ...Array.from(memberNameMap.entries()),
                ...Array.from(friendMap.entries()),
            ]);
            const { contactId, convId } = await ensureContactAndConversation(orgId, accountId, groupId, groupName, null, groupId, true);
            let groupSaved = 0;
            let lastMsgId = null;
            let page = 0;
            const threadStart = Date.now();
            const unknownUids = new Set();
            while (page < MAX_PAGES) {
                if (Date.now() - threadStart > THREAD_TIMEOUT_MS)
                    break;
                const msgs = await collectBatchWithRetry(api.listener, THREAD_TYPE_GROUP, lastMsgId, groupId);
                if (msgs.length === 0)
                    break;
                for (const msg of msgs) {
                    const senderUid = String(msg.data?.uidFrom || "");
                    const dName = (msg.data?.dName || "").trim();
                    if (senderUid && !dName && !combinedMap.has(senderUid)) {
                        unknownUids.add(senderUid);
                    }
                }
                const savedCount = await bulkSaveMessages(msgs, convId, combinedMap);
                groupSaved += savedCount;
                result.skipped += msgs.length - savedCount;
                const oldest = getOldestMsgId(msgs);
                if (!oldest || oldest === lastMsgId)
                    break;
                lastMsgId = oldest;
                page++;
                await sleepRandom();
            }
            if (unknownUids.size > 0) {
                await resolveAndBackfillNames(unknownUids, api, orgId);
            }
            result.totalMessages += groupSaved;
            groupDone++;
            emitProgress(`Nhóm [${groupDone}/${groupIds.length}] "${groupName}"`, Math.round(30 + (groupDone / (groupIds.length || 1)) * 65));
        }
        catch (err) {
            result.errors++;
            groupDone++;
        }
    }
    emitProgress(`Hoàn thành! ${result.totalMessages} tin mới · ${result.skipped} đã có`, 100);
    io?.emit("history:done", { accountId, result });
    return result;
}
// ─────────────────────────────────────────────────────────────────────────────
// Các hàm tiện ích đã được tối ưu hóa
// ─────────────────────────────────────────────────────────────────────────────
// Tối ưu: Đảm bảo DB có sẵn Contact & Conv (Chỉ gọi 1 lần mỗi thread)
async function ensureContactAndConversation(orgId, accountId, uid, name, avatar, threadId, isGroup) {
    // Upsert Contact
    const contact = await prisma.contact
        .upsert({
        where: { id: uid }, // Cần chắc chắn schema.prisma có unique ở zaloUid hoặc kết hợp
        // Lưu ý: Do schema bạn không để @unique cho zaloUid ở Contact, nên ta dùng findFirst + create
        create: {
            id: randomUUID(),
            orgId,
            zaloUid: uid,
            fullName: name || "Unknown",
            avatarUrl: avatar,
            metadata: isGroup ? { isGroup: true } : {},
        },
        update: isGroup ? { fullName: name } : {}, // Update tên group nếu đổi
    })
        .catch(async () => {
        let c = await prisma.contact.findFirst({
            where: { zaloUid: uid, orgId },
        });
        if (!c) {
            c = await prisma.contact.create({
                data: {
                    id: randomUUID(),
                    orgId,
                    zaloUid: uid,
                    fullName: name || "Unknown",
                    avatarUrl: avatar,
                },
            });
        }
        return c;
    });
    // Upsert Conversation
    let conv = await prisma.conversation.findFirst({
        where: { zaloAccountId: accountId, externalThreadId: threadId },
    });
    if (!conv) {
        conv = await prisma.conversation.create({
            data: {
                id: randomUUID(),
                orgId,
                zaloAccountId: accountId,
                contactId: contact.id,
                threadType: isGroup ? "group" : "user",
                externalThreadId: threadId,
                lastMessageAt: new Date(),
                unreadCount: 0,
            },
        });
    }
    return { contactId: contact.id, convId: conv.id };
}
// Tối ưu: Lưu hàng loạt bằng createMany để giảm tải DB
async function bulkSaveMessages(msgs, convId, nameMap) {
    if (msgs.length === 0)
        return 0;
    let maxTs = 0;
    const validMessages = [];
    for (const msg of msgs) {
        const msgId = String(msg.data?.msgId || msg.msgId || "");
        if (!msgId)
            continue;
        const isSelf = msg.isSelf === true;
        const tsRaw = msg.data?.ts || msg.ts;
        const ts = tsRaw ? parseInt(String(tsRaw)) : Date.now();
        if (ts > maxTs)
            maxTs = ts;
        const rawContent = msg.data?.content;
        const content = typeof rawContent === "string"
            ? rawContent
            : rawContent
                ? JSON.stringify(rawContent)
                : "";
        const contentType = detectContentType(msg.data?.msgType, rawContent);
        const senderUid = String(msg.data?.uidFrom || "");
        let senderName = (msg.data?.dName || "").trim();
        if (!senderName && senderUid) {
            const entry = nameMap.get(senderUid);
            if (typeof entry === "string")
                senderName = entry;
            else if (entry && typeof entry === "object")
                senderName = entry.name || "";
        }
        validMessages.push({
            id: randomUUID(),
            conversationId: convId,
            zaloMsgId: msgId,
            senderType: isSelf ? "self" : "contact",
            senderUid: senderUid || null,
            senderName: senderName || null,
            content,
            contentType,
            attachments: [],
            sentAt: new Date(ts),
        });
    }
    if (validMessages.length === 0)
        return 0;
    try {
        // Bulk Insert, bỏ qua nếu tin nhắn đã tồn tại (đòi hỏi @unique zaloMsgId trong schema)
        // Giả định schema sẽ được/đã được thêm @unique cho zaloMsgId, nếu không nó vẫn chèn
        const result = await prisma.message.createMany({
            data: validMessages,
            skipDuplicates: true,
        });
        // Update last message time cho conversation (1 câu query duy nhất)
        if (maxTs > 0) {
            await prisma.conversation.updateMany({
                where: { id: convId, lastMessageAt: { lt: new Date(maxTs) } },
                data: { lastMessageAt: new Date(maxTs) },
            });
        }
        return result.count;
    }
    catch (err) {
        logger.error("[history-sync] bulkSaveMessages error:", err);
        return 0;
    }
}
// Tối ưu: Retry logic (Sửa lỗi ngưng ngầm do server Zalo delay)
async function collectBatchWithRetry(listener, threadType, lastMsgId, expectedThreadId) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const msgs = await collectOneBatch(listener, threadType, lastMsgId, expectedThreadId);
            if (msgs.length > 0)
                return msgs;
            // Nếu trả về mảng rỗng, ta đợi một chút rồi thử lại (có thể Zalo chưa kịp trả data)
            if (attempt < MAX_RETRIES) {
                await sleep(1500 * attempt);
            }
        }
        catch (err) {
            if (attempt === MAX_RETRIES)
                return [];
            await sleep(1500 * attempt);
        }
    }
    return [];
}
function collectOneBatch(listener, threadType, lastMsgId, expectedThreadId) {
    return new Promise((resolve, reject) => {
        let resolved = false;
        let timer;
        const done = (msgs) => {
            if (resolved)
                return;
            resolved = true;
            clearTimeout(timer);
            listener.removeListener("old_messages", handler);
            resolve(msgs);
        };
        const handler = (messages, type) => {
            // Đôi khi Zalo không trả về type rõ ràng, bỏ qua check type cho an toàn nếu mảng có dữ liệu
            if (!Array.isArray(messages))
                return done([]);
            // FIX LỖI 2: Quét qua tất cả các trường có khả năng chứa ID nhóm (idTo, sourceId, threadId)
            const filtered = messages.filter((m) => {
                const possibleIds = [
                    String(m.threadId || ""),
                    String(m.idTo || ""),
                    String(m.data?.idTo || ""),
                    String(m.groupId || ""),
                    String(m.sourceId || ""),
                ];
                // Nếu bất kỳ trường nào khớp với ID nhóm đang quét -> Giữ lại tin nhắn
                return possibleIds.some((id) => id.includes(expectedThreadId));
            });
            done(filtered);
        };
        listener.on("old_messages", handler);
        try {
            // FIX LỖI 1: Bắt buộc phải truyền expectedThreadId vào hàm requestOldMessages
            // Lưu ý: Tùy theo cách bạn định nghĩa hàm này ở file zalo-listener-factory,
            // thứ tự tham số có thể là (threadId, type, msgId) hoặc (type, threadId, msgId).
            // Phổ biến nhất trong thư viện zca-js là:
            if (listener.requestOldMessages.length >= 3) {
                listener.requestOldMessages(expectedThreadId, threadType, lastMsgId);
            }
            else {
                // Fallback nếu code cũ của bạn viết đè hàm này
                listener.requestOldMessages(threadType, lastMsgId, expectedThreadId);
            }
            timer = setTimeout(() => reject(new Error("TIMEOUT")), BATCH_TIMEOUT_MS);
        }
        catch (e) {
            done([]);
        }
    });
}
function getOldestMsgId(msgs) {
    let oldest = null;
    let oldestId = null;
    for (const m of msgs) {
        const id = String(m.data?.msgId || m.msgId || "");
        if (!id)
            continue;
        try {
            const n = BigInt(id);
            if (oldest === null || n < oldest) {
                oldest = n;
                oldestId = id;
            }
        }
        catch {
            if (!oldestId)
                oldestId = id;
        }
    }
    return oldestId;
}
async function resolveAndBackfillNames(unknownUids, api, orgId) {
    for (const uid of unknownUids) {
        try {
            const result = await api.getUserInfo(uid);
            const profiles = result?.changed_profiles || {};
            const profile = profiles[uid] || profiles[`${uid}_0`];
            if (!profile)
                continue;
            const name = (profile.zaloName ||
                profile.zalo_name ||
                profile.displayName ||
                profile.display_name ||
                "").trim();
            if (!name)
                continue;
            await prisma.$executeRawUnsafe(`UPDATE messages SET sender_name = $1 WHERE sender_uid = $2 AND (sender_name IS NULL OR sender_name = '')`, name, uid);
        }
        catch (e) { }
        await sleep(200);
    }
}
//# sourceMappingURL=zalo-history-sync.js.map