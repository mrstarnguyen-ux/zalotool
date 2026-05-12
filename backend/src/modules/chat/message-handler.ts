/**
 * message-handler.ts — persists incoming Zalo messages to the database.
 * Called from zalo-pool's startListener on every 'message' / 'undo' event.
 *
 * FIX (self-message sync):
 *  - IncomingMessage now has optional `recipientUid` field.
 *  - When isSelf=true on a user thread, we upsert the RECIPIENT as a contact
 *    (not null). Previously, self-sent DMs returned contactId=null, so no
 *    conversation contact was linked and the conversation could not be matched
 *    on subsequent incoming messages from that contact.
 *  - findOrCreateConversation now also updates contactId if it was null before
 *    (covers existing conversations created before this fix).
 */
import { prisma } from "../../shared/database/prisma-client.js";
import { logger } from "../../shared/utils/logger.js";
import { randomUUID } from "node:crypto";
import { emitWebhook } from "../api/webhook-service.js";

export interface IncomingMessage {
  accountId: string;
  senderUid: string;
  senderName: string; // zaloName (from cache or dName fallback)
  content: string;
  contentType: string; // text, image, sticker, video, voice, gif, link, file
  msgId: string;
  timestamp: number; // epoch ms
  isSelf: boolean;
  threadId: string; // For user: contact UID. For group: group ID
  threadType: "user" | "group"; // user or group conversation
  groupName?: string; // group name if group message
  attachments?: any[];
  /**
   * FIX: recipientUid — only set for self-sent DMs (isSelf=true, threadType=user).
   * This is the UID of the contact on the OTHER end of the conversation.
   * Used to upsert the contact record when the agent sends first.
   */
  recipientUid?: string;
}

export interface HandleMessageResult {
  message: {
    id: string;
    conversationId: string;
    zaloMsgId: string | null;
    senderType: string;
    senderUid: string | null;
    senderName: string | null;
    content: string | null;
    contentType: string;
    attachments: any;
    isDeleted: boolean;
    deletedAt: Date | null;
    sentAt: Date;
    repliedByUserId: string | null;
    createdAt: Date;
  };
  conversationId: string;
  orgId: string;
  contactId: string | null;
}

export async function handleIncomingMessage(
  msg: IncomingMessage,
): Promise<HandleMessageResult | null> {
  try {
    const account = await prisma.zaloAccount.findUnique({
      where: { id: msg.accountId },
      select: { orgId: true, ownerUserId: true },
    });
    if (!account) return null;

    const contactId = await upsertContact(msg, account.orgId);

    const conversation = await findOrCreateConversation(
      msg,
      account.orgId,
      contactId,
    );

    const sentAt = new Date(msg.timestamp);
    const message = await prisma.message.create({
      data: {
        id: randomUUID(),
        conversationId: conversation.id,
        zaloMsgId: msg.msgId || null,
        senderType: msg.isSelf ? "self" : "contact",
        senderUid: msg.senderUid,
        senderName: msg.senderName || null,
        content: msg.content || "",
        contentType: msg.contentType || "text",
        attachments: msg.attachments ?? [],
        sentAt,
      },
    });

    await updateConversationAfterMessage(conversation.id, sentAt, msg.isSelf);

    // Track first outbound contact date — set once when agent sends first message
    if (msg.isSelf && contactId) {
      prisma.contact
        .updateMany({
          where: { id: contactId, firstContactDate: null },
          data: { firstContactDate: new Date(msg.timestamp) },
        })
        .catch(() => {});
    }

    // Emit webhook for message event (fire-and-forget)
    emitWebhook(
      account.orgId,
      msg.isSelf ? "message.sent" : "message.received",
      {
        messageId: message.id,
        conversationId: conversation.id,
        senderUid: msg.senderUid,
        content: msg.content,
        contentType: msg.contentType,
        sentAt: message.sentAt,
      },
    );

    return {
      message,
      conversationId: conversation.id,
      orgId: account.orgId,
      contactId,
    };
  } catch (err) {
    logger.error("[message-handler] handleIncomingMessage error:", err);
    return null;
  }
}

// Upsert contact — handles both user and group conversations
async function upsertContact(
  msg: IncomingMessage,
  orgId: string,
): Promise<string | null> {
  // Group messages: create/update a "contact" record representing the group
  if (msg.threadType === "group") {
    const groupUid = msg.threadId;

    const groupContact = await prisma.contact.upsert({
      where: { orgId_zaloUid: { orgId, zaloUid: groupUid } },
      create: {
        id: randomUUID(),
        orgId,
        zaloUid: groupUid,
        fullName: msg.groupName || "Nhóm",
        metadata: { isGroup: true },
      },
      update: {
        // Cập nhật tên nhóm nếu thay đổi
        ...(msg.groupName ? { fullName: msg.groupName } : {}),
      },
      select: { id: true, fullName: true },
    });

    return groupContact.id;
  }

  /**
   * FIX — self-sent DMs now upsert the RECIPIENT as a contact.
   *
   * Previous logic: if (msg.isSelf) return null;
   * This meant self-sent messages had contactId=null on the conversation,
   * breaking conversation matching when the contact later replied.
   *
   * New logic: use recipientUid (contact UID) when isSelf=true.
   * senderName here is the recipient's resolved zaloName (set by listener-factory).
   */
  if (msg.isSelf) {
    if (!msg.recipientUid) return null;

    const contact = await prisma.contact.upsert({
      where: { orgId_zaloUid: { orgId, zaloUid: msg.recipientUid } },
      create: {
        id: randomUUID(),
        orgId,
        zaloUid: msg.recipientUid,
        fullName: msg.senderName || "Unknown",
      },
      update: {
        ...(msg.senderName ? { fullName: msg.senderName } : {}),
      },
      select: { id: true },
    });

    return contact.id;
  }

  // Incoming message from contact — dùng upsert để tránh duplicate
  const contact = await prisma.contact.upsert({
    where: { orgId_zaloUid: { orgId, zaloUid: msg.senderUid } },
    create: {
      id: randomUUID(),
      orgId,
      zaloUid: msg.senderUid,
      fullName: msg.senderName || "Unknown",
    },
    update: {
      // Cập nhật tên nếu Zalo name thay đổi
      ...(msg.senderName ? { fullName: msg.senderName } : {}),
    },
    select: { id: true },
  });

  return contact.id;
}

// Find or create conversation — externalThreadId = threadId for both user and group
async function findOrCreateConversation(
  msg: IncomingMessage,
  orgId: string,
  contactId: string | null,
) {
  const externalThreadId = msg.threadId;

  const existing = await prisma.conversation.findFirst({
    where: { zaloAccountId: msg.accountId, externalThreadId },
    select: { id: true, contactId: true },
  });

  if (existing) {
    /**
     * FIX: If conversation exists but contactId is null (created before this fix
     * by a self-sent message that returned null), update it now so the contact
     * panel and conversation list show the correct contact.
     */
    if (!existing.contactId && contactId) {
      await prisma.conversation.update({
        where: { id: existing.id },
        data: { contactId },
      });
    }
    return existing;
  }

  return prisma.conversation.create({
    data: {
      id: randomUUID(),
      orgId,
      zaloAccountId: msg.accountId,
      contactId,
      threadType: msg.threadType,
      externalThreadId,
      lastMessageAt: new Date(msg.timestamp),
      unreadCount: msg.isSelf ? 0 : 1,
      isReplied: msg.isSelf,
    },
    select: { id: true, contactId: true },
  });
}

// Update conversation metadata after a new message
async function updateConversationAfterMessage(
  conversationId: string,
  sentAt: Date,
  isSelf: boolean,
): Promise<void> {
  const updateData: any = { lastMessageAt: sentAt };
  if (isSelf) {
    updateData.isReplied = true;
    updateData.unreadCount = 0;
  } else {
    updateData.unreadCount = { increment: 1 };
    updateData.isReplied = false;
  }
  await prisma.conversation.update({
    where: { id: conversationId },
    data: updateData,
  });
}

// Soft-delete a message by its Zalo message ID
export async function handleMessageUndo(
  accountId: string,
  zaloMsgId: string,
): Promise<void> {
  try {
    await prisma.message.updateMany({
      where: { zaloMsgId: String(zaloMsgId) },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    logger.info(
      `[message-handler] Undo message ${zaloMsgId} for account ${accountId}`,
    );
  } catch (err) {
    logger.error("[message-handler] handleMessageUndo error:", err);
  }
}
