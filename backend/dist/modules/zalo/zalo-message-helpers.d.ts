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
export declare function detectContentType(msgType: string | undefined, content: any): string;
/**
 * Kiểm tra xem một tin nhắn có phải là tin thu hồi/xóa (recall) không.
 * zca-js gửi event "undo" riêng, nhưng đôi khi gửi qua "message" với content là JSON array
 * có dạng [{"type":1,"actionType":0,"uidFrom":"...","clientDelMsgId":...}]
 */
export declare function isRecallMessage(content: any): boolean;
/**
 * Lấy msgId từ recall JSON để mark tin nhắn gốc là deleted
 */
export declare function extractRecallMsgId(content: string): string | null;
/**
 * Fire-and-forget: fill in a missing avatarUrl on a Contact row.
 * Only updates rows where avatarUrl is currently null.
 */
export declare function updateContactAvatar(zaloUid: string, avatarUrl: string): void;
//# sourceMappingURL=zalo-message-helpers.d.ts.map