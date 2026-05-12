/**
 * zalo-message-helpers.ts — utilities for processing incoming Zalo messages.
 * Detects content type from msgType and updates contact avatars fire-and-forget.
 */
import { prisma } from '../../shared/database/prisma-client.js';

/**
 * Map zca-js msgType string to a normalized content type label.
 * Falls back to 'text' for unrecognised types or plain-string content.
 */
export function detectContentType(msgType: string | undefined, content: any): string {
  // 1. Kiểm tra nếu content là dạng mảng chứa actionType hoặc globalDelMsgId (Tin nhắn thu hồi/hệ thống)
  if (Array.isArray(content) && (content[0]?.actionType !== undefined || content[0]?.globalDelMsgId)) {
    return 'system';
  }
  
  if (!msgType) return 'text';
  
  // 2. Kiểm tra dựa trên msgType của Zalo
  const type = msgType.toLowerCase();
  if (type.includes('photo') || type.includes('image')) return 'image';
  if (type.includes('sticker')) return 'sticker';
  if (type.includes('video')) return 'video';
  if (type.includes('voice')) return 'voice';
  if (type.includes('gif')) return 'gif';
  if (type.includes('link')) return 'link';
  if (type.includes('location')) return 'location';
  if (type.includes('file') || type.includes('doc')) return 'file';
  if (type.includes('recommended') || type.includes('card')) return 'contact_card';
  
  // 3. Nếu content là object và chứa các từ khóa hệ thống
  if (typeof content === 'object' && content !== null) {
    if (content.actionType !== undefined || content.globalDelMsgId) return 'system';
    return 'rich';
  }

  // 4. Kiểm tra chuỗi JSON nếu content là string nhưng chứa dữ liệu hệ thống
  if (typeof content === 'string' && content.includes('"actionType":')) {
    return 'system';
  }

  return 'text';
}

/**
 * Fire-and-forget: fill in a missing avatarUrl on a Contact row.
 * Only updates rows where avatarUrl is currently null.
 */
export function updateContactAvatar(zaloUid: string, avatarUrl: string): void {
  prisma.contact
    .updateMany({
      where: { zaloUid, avatarUrl: null },
      data: { avatarUrl },
    })
    .catch(() => {});
}
