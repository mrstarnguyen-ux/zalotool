/**
 * zalo-listener-factory.ts — sets up zca-js listener events for one Zalo account.
 * Handles message routing, user-info caching, group detection, and undo events.
 * Extracted from ZaloAccountPool to keep zalo-pool.ts under 200 lines.
 *
 * FIX (self-message sync):
 *  1. ownZaloUid added to ListenerContext — required to distinguish self-sent messages.
 *  2. For isSelf=true DMs: threadId = contact UID (correct), senderUid = own UID.
 *     We now pass recipientUid to message-handler so it can upsert the contact record.
 *  3. retryOnClose removed from listener.start() — the 'closed' event already calls
 *     onDisconnected → auto-reconnect. Having both caused duplicate reconnects that
 *     triggered the circuit breaker and required QR re-login.
 */
import type { Server } from "socket.io";
import { logger } from "../../shared/utils/logger.js";
import {
  handleIncomingMessage,
  handleMessageUndo,
} from "../chat/message-handler.js";
import {
  detectContentType,
  updateContactAvatar,
  isRecallMessage,
  extractRecallMsgId,
} from "./zalo-message-helpers.js";

// Cached user info entry with 5-minute TTL
export interface UserInfoCacheEntry {
  zaloName: string;
  avatar: string;
  phone?: string;
  cachedAt: number;
}

const USER_INFO_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function resolveZaloName(
  api: any,
  uid: string,
  cache: Map<string, UserInfoCacheEntry>,
): Promise<{ zaloName: string; avatar: string }> {
  const cached = cache.get(uid);
  if (cached && Date.now() - cached.cachedAt < USER_INFO_CACHE_TTL_MS) {
    return { zaloName: cached.zaloName, avatar: cached.avatar };
  }

  try {
    const result = await api.getUserInfo(uid);
    const profiles = result?.changed_profiles || {};
    const profile = profiles[uid] || profiles[`${uid}_0`];
    if (profile) {
      const entry: UserInfoCacheEntry = {
        zaloName:
          profile.zaloName ||
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
  } catch (err) {
    logger.warn(`[zalo] getUserInfo failed for ${uid}:`, err);
  }
  return { zaloName: "", avatar: "" };
}

async function resolveGroupName(api: any, groupId: string): Promise<string> {
  try {
    const result = await api.getGroupInfo(groupId);
    const info = result?.gridInfoMap?.[groupId];
    return info?.name || "";
  } catch (err) {
    logger.warn(`[zalo] getGroupInfo failed for ${groupId}:`, err);
    return "";
  }
}

export interface ListenerContext {
  accountId: string;
  api: any;
  io: Server | null;
  userInfoCache: Map<string, UserInfoCacheEntry>;
  onDisconnected: (accountId: string) => void;
  /** FIX: own UID of this Zalo account — needed to normalize self-message threadId */
  ownZaloUid: string;
}

export function attachZaloListener(ctx: ListenerContext): void {
  const { accountId, api, io, userInfoCache, onDisconnected, ownZaloUid } = ctx;
  const listener = api.listener;

  listener.on("connected", () => {
    logger.info(`[zalo:${accountId}] Listener connected`);
  });

  listener.on("message", async (message: any) => {
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
        logger.warn(
          `[zalo:${accountId}] Self-message with threadId===ownUid, cannot determine recipient — skipping (msgId: ${message.data?.msgId})`,
        );
        return;
      }

      // Resolve display name
      let senderName: string = message.data?.dName || "";

      if (isSelf && !isGroup) {
        // FIX: For self-sent DMs, resolve the RECIPIENT so we can show/upsert them
        const recipientUid = conversationThreadId;
        if (recipientUid && api.getUserInfo) {
          const userInfo = await resolveZaloName(
            api,
            recipientUid,
            userInfoCache,
          );
          if (userInfo.zaloName) senderName = userInfo.zaloName;
          if (userInfo.avatar)
            updateContactAvatar(recipientUid, userInfo.avatar);
        }
      } else if (!isSelf && senderUid && api.getUserInfo) {
        const userInfo = await resolveZaloName(api, senderUid, userInfoCache);
        if (userInfo.zaloName) senderName = userInfo.zaloName;
        if (userInfo.avatar) updateContactAvatar(senderUid, userInfo.avatar);
      }

      let groupName: string | undefined;
      if (isGroup && conversationThreadId) {
        groupName = await resolveGroupName(api, conversationThreadId);
      }

      const rawContent = message.data?.content;
      const content =
        typeof rawContent === "string"
          ? rawContent
          : JSON.stringify(rawContent || "");
      const contentType = detectContentType(message.data?.msgType, rawContent);

      // FIX: Phát hiện tin nhắn thu hồi gửi qua event "message" (không phải "undo")
      // Dạng: [{"type":1,"actionType":0,"clientDelMsgId":...,"globalDelMsgId":...}]
      if (isRecallMessage(content)) {
        const recallMsgId = extractRecallMsgId(content);
        if (recallMsgId) {
          logger.info(
            `[zalo:${accountId}] Recall message detected, marking msgId=${recallMsgId} as deleted`,
          );
          await handleMessageUndo(accountId, recallMsgId);
          io?.emit("chat:deleted", { accountId, msgId: recallMsgId });
        }
        return; // Không lưu tin nhắn này vào DB
      }

      // FIX: Bỏ qua bubble message (sendBubbleMessage) — loại tin nhắn đặc biệt
      // của Zalo (card/interactive) mà zca-js chưa parse được nội dung
      if (
        contentType === "bubble" ||
        message.data?.msgType?.includes?.("sendBubble")
      ) {
        logger.debug(
          `[zalo:${accountId}] Skipping bubble message (msgId: ${message.data?.msgId})`,
        );
        return;
      }

      // FIX: pass recipientUid for self-sent DMs so message-handler
      // can upsert the contact on the OTHER side of the conversation
      const recipientUid =
        isSelf && !isGroup ? conversationThreadId : undefined;

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
    } catch (err) {
      logger.error(`[zalo:${accountId}] Message handler error:`, err);
    }
  });

  listener.on("undo", async (data: any) => {
    const msgId = data.data?.msgId || data.msgId;
    if (msgId) {
      await handleMessageUndo(accountId, String(msgId));
      io?.emit("chat:deleted", { accountId, msgId: String(msgId) });
    }
  });

  listener.on("closed", (code: number, reason: string) => {
    logger.warn(`[zalo:${accountId}] Listener closed: ${code} ${reason}`);
    onDisconnected(accountId);
    io?.emit("zalo:disconnected", { accountId, code, reason });
  });

  listener.on("error", (err: any) => {
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
