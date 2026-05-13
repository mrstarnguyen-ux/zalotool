import { logger } from "../../shared/utils/logger.js";
import { handleIncomingMessage, handleMessageUndo, } from "../chat/message-handler.js";
import { detectContentType, updateContactAvatar, isRecallMessage, extractRecallMsgId, } from "./zalo-message-helpers.js";
const USER_INFO_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
async function resolveZaloName(api, uid, cache) {
    const cached = cache.get(uid);
    if (cached && Date.now() - cached.cachedAt < USER_INFO_CACHE_TTL_MS) {
        return { zaloName: cached.zaloName, avatar: cached.avatar };
    }
    try {
        const result = await api.getUserInfo(uid);
        const profiles = result?.changed_profiles || {};
        const profile = profiles[uid] || profiles[`${uid}_0`];
        if (profile) {
            const entry = {
                zaloName: profile.zaloName ||
                    profile.zalo_name ||
                    profile.displayName ||
                    profile.display_name ||
                    "",
                avatar: profile.avatar || "",
                phone: profile.phoneNumber || "",
                cachedAt: Date.now(),
            };
            cache.set(uid, entry);
            return { zaloName: entry.zaloName, avatar: entry.avatar };
        }
    }
    catch (err) {
        logger.warn(`[zalo] getUserInfo failed for ${uid}:`, err);
    }
    return { zaloName: "", avatar: "" };
}
async function resolveGroupName(api, groupId) {
    try {
        const result = await api.getGroupInfo(groupId);
        const info = result?.gridInfoMap?.[groupId];
        return info?.name || "";
    }
    catch (err) {
        logger.warn(`[zalo] getGroupInfo failed for ${groupId}:`, err);
        return "";
    }
}
export function attachZaloListener(ctx) {
    const { accountId, api, io, userInfoCache, onDisconnected, ownZaloUid } = ctx;
    const listener = api.listener;
    listener.on("connected", () => {
        logger.info(`[zalo:${accountId}] Listener connected`);
    });
    listener.on("message", async (message) => {
        try {
            const isGroup = message.type === 1;
            const isSelf = message.isSelf === true;
            const senderUid = String(message.data?.uidFrom || "");
            const conversationThreadId = message.threadId || "";
            /**
             * FIX — self-message threadId guard:
             * In zca-js, for self-sent DMs:
             *   uidFrom = own UID, threadId = recipient's UID  ✓ (most versions)
             * But in some edge cases threadId = ownUID (malformed). Guard against that.
             */
            if (!isGroup && isSelf && conversationThreadId === ownZaloUid) {
                logger.warn(`[zalo:${accountId}] Self-message with threadId===ownUid, cannot determine recipient — skipping (msgId: ${message.data?.msgId})`);
                return;
            }
            // Resolve display name
            let senderName = message.data?.dName || "";
            if (isSelf && !isGroup) {
                // FIX: For self-sent DMs, resolve the RECIPIENT so we can show/upsert them
                const recipientUid = conversationThreadId;
                if (recipientUid && api.getUserInfo) {
                    const userInfo = await resolveZaloName(api, recipientUid, userInfoCache);
                    if (userInfo.zaloName)
                        senderName = userInfo.zaloName;
                    if (userInfo.avatar)
                        updateContactAvatar(recipientUid, userInfo.avatar);
                }
            }
            else if (!isSelf && senderUid && api.getUserInfo) {
                const userInfo = await resolveZaloName(api, senderUid, userInfoCache);
                if (userInfo.zaloName)
                    senderName = userInfo.zaloName;
                if (userInfo.avatar)
                    updateContactAvatar(senderUid, userInfo.avatar);
            }
            let groupName;
            if (isGroup && conversationThreadId) {
                groupName = await resolveGroupName(api, conversationThreadId);
            }
            const rawContent = message.data?.content;
            const content = typeof rawContent === "string"
                ? rawContent
                : JSON.stringify(rawContent || "");
            const contentType = detectContentType(message.data?.msgType, rawContent);
            // FIX: Phát hiện tin nhắn thu hồi gửi qua event "message" (không phải "undo")
            // Dạng: [{"type":1,"actionType":0,"clientDelMsgId":...,"globalDelMsgId":...}]
            if (isRecallMessage(content)) {
                const recallMsgId = extractRecallMsgId(content);
                if (recallMsgId) {
                    logger.info(`[zalo:${accountId}] Recall message detected, marking msgId=${recallMsgId} as deleted`);
                    await handleMessageUndo(accountId, recallMsgId);
                    io?.emit("chat:deleted", { accountId, msgId: recallMsgId });
                }
                return; // Không lưu tin nhắn này vào DB
            }
            // FIX: Bỏ qua bubble message (sendBubbleMessage) — loại tin nhắn đặc biệt
            // của Zalo (card/interactive) mà zca-js chưa parse được nội dung
            if (contentType === "bubble" ||
                message.data?.msgType?.includes?.("sendBubble")) {
                logger.debug(`[zalo:${accountId}] Skipping bubble message (msgId: ${message.data?.msgId})`);
                return;
            }
            // FIX: pass recipientUid for self-sent DMs so message-handler
            // can upsert the contact on the OTHER side of the conversation
            const recipientUid = isSelf && !isGroup ? conversationThreadId : undefined;
            const result = await handleIncomingMessage({
                accountId,
                senderUid,
                senderName,
                content,
                contentType,
                msgId: String(message.data?.msgId || ""),
                timestamp: parseInt(message.data?.ts || String(Date.now())),
                isSelf,
                threadId: conversationThreadId,
                threadType: isGroup ? "group" : "user",
                groupName,
                attachments: [],
                recipientUid,
            });
            if (result) {
                io?.emit("chat:message", {
                    accountId,
                    message: result.message,
                    conversationId: result.conversationId,
                });
            }
        }
        catch (err) {
            logger.error(`[zalo:${accountId}] Message handler error:`, err);
        }
    });
    listener.on("undo", async (data) => {
        const msgId = data.data?.msgId || data.msgId;
        if (msgId) {
            await handleMessageUndo(accountId, String(msgId));
            io?.emit("chat:deleted", { accountId, msgId: String(msgId) });
        }
    });
    listener.on("closed", (code, reason) => {
        logger.warn(`[zalo:${accountId}] Listener closed: ${code} ${reason}`);
        onDisconnected(accountId);
        io?.emit("zalo:disconnected", { accountId, code, reason });
    });
    listener.on("error", (err) => {
        logger.error(`[zalo:${accountId}] Listener error:`, err);
    });
    /**
     * FIX: Removed { retryOnClose: true }.
     * The 'closed' event already triggers onDisconnected → pool.autoReconnect().
     * retryOnClose made zca-js ALSO retry internally → two parallel reconnect flows
     * → circuit breaker (5 disconnects/5min) tripped falsely → forced QR re-login.
     */
    listener.start();
}
//# sourceMappingURL=zalo-listener-factory.js.map