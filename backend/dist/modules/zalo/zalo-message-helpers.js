/**
 * zalo-message-helpers.ts — utilities for processing incoming Zalo messages.
 * Detects content type from msgType and updates contact avatars fire-and-forget.
 */
import { prisma } from "../../shared/database/prisma-client.js";
/**
 * Map zca-js msgType string to a normalized content type label.
 * Falls back to 'text' for unrecognised types or plain-string content.
 *
 * FIX: Zalo gửi nhiều loại tin qua msgType="recommended" hoặc "card":
 *  - Cuộc gọi:   action = "recommened.calltime"
 *  - Link nhóm:  href chứa "zalo.me/g/"
 *  - Danh thiếp: các trường hợp còn lại
 * Cần parse content để phân biệt.
 */
export function detectContentType(msgType, content) {
    if (!msgType)
        return "text";
    if (msgType.includes("photo") || msgType.includes("image"))
        return "image";
    if (msgType.includes("sticker"))
        return "sticker";
    if (msgType.includes("video"))
        return "video";
    if (msgType.includes("voice"))
        return "voice";
    if (msgType.includes("gif"))
        return "gif";
    if (msgType.includes("link"))
        return "link";
    if (msgType.includes("location"))
        return "location";
    if (msgType.includes("file") || msgType.includes("doc"))
        return "file";
    // FIX: "recommended" / "card" có thể là cuộc gọi, link nhóm, link preview, hoặc danh thiếp
    // → parse content để phân biệt chính xác
    if (msgType.includes("recommended") || msgType.includes("card")) {
        const parsed = parseJsonContent(content);
        if (parsed) {
            // Cuộc gọi: action = "recommened.calltime"
            if (parsed.action === "recommened.calltime" ||
                parsed.action?.includes("call") ||
                parsed.description === "Cuộc gọi")
                return "call";
            // Link preview: action = "recommened.link" hoặc có href là URL thường
            if (parsed.action === "recommened.link" ||
                parsed.action?.includes("link"))
                return "link_preview";
            // Link nhóm Zalo: href chứa "zalo.me/g/"
            if (parsed.href?.includes("zalo.me/g/"))
                return "group_link";
            // Bubble ẩn (title = sendBubbleMessage)
            if (parsed.title === "sendBubbleMessage")
                return "bubble";
        }
        return "contact_card";
    }
    // FIX: bubble message (sendBubbleMessage qua msgType)
    if (msgType.includes("bubble") || msgType.includes("Bubble"))
        return "bubble";
    if (typeof content === "object" && content !== null)
        return "rich";
    return "text";
}
/** Parse JSON content an toàn, trả về object hoặc null */
function parseJsonContent(content) {
    if (typeof content === "object" && content !== null)
        return content;
    if (typeof content === "string") {
        try {
            return JSON.parse(content);
        }
        catch {
            return null;
        }
    }
    return null;
}
/**
 * Kiểm tra xem một tin nhắn có phải là tin thu hồi/xóa (recall) không.
 * zca-js gửi event "undo" riêng, nhưng đôi khi gửi qua "message" với content là JSON array
 * có dạng [{"type":1,"actionType":0,"uidFrom":"...","clientDelMsgId":...}]
 */
export function isRecallMessage(content) {
    if (typeof content !== "string")
        return false;
    const trimmed = content.trim();
    if (!trimmed.startsWith("[{") && !trimmed.startsWith("{"))
        return false;
    try {
        const parsed = JSON.parse(trimmed);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        // Zalo recall message có field clientDelMsgId hoặc globalDelMsgId
        return arr.some((item) => item &&
            (item.clientDelMsgId !== undefined ||
                item.globalDelMsgId !== undefined));
    }
    catch {
        return false;
    }
}
/**
 * Lấy msgId từ recall JSON để mark tin nhắn gốc là deleted
 */
export function extractRecallMsgId(content) {
    try {
        const parsed = JSON.parse(content.trim());
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        const item = arr[0];
        // clientDelMsgId là msgId của tin nhắn bị thu hồi
        return String(item?.clientDelMsgId || item?.globalDelMsgId || "") || null;
    }
    catch {
        return null;
    }
}
/**
 * Fire-and-forget: fill in a missing avatarUrl on a Contact row.
 * Only updates rows where avatarUrl is currently null.
 */
export function updateContactAvatar(zaloUid, avatarUrl) {
    prisma.contact
        .updateMany({
        where: { zaloUid, avatarUrl: null },
        data: { avatarUrl },
    })
        .catch(() => { });
}
//# sourceMappingURL=zalo-message-helpers.js.map