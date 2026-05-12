import { prisma } from "../../shared/database/prisma-client.js";
import { logger } from "../../shared/utils/logger.js";
import { randomUUID } from "node:crypto";
import { emitWebhook } from "../api/webhook-service.js";

export interface IncomingMessage {
  accountId: string;
  senderUid: string;
  senderName: string;
  content: string;
  contentType: string;
  msgId: string;
  timestamp: number;
  isSelf: boolean;
  threadId: string;
  threadType: "user" | "group";
  groupName?: string;
  attachments?: any[];
  recipientUid?: string;
}

export interface HandleMessageResult {
  message: any;
  conversationId: string;
  orgId: string;
  contactId: string | null;
}

export async function handleIncomingMessage(msg: IncomingMessage): Promise<HandleMessageResult | null> {
  try {
    const account = await prisma.zaloAccount.findUnique({
      where: { id: msg.accountId },
      select: { orgId: true, ownerUserId: true },
    });
    if (!account) return null;

    const contactId = await upsertContact(msg, account.orgId);
    const conversation = await findOrCreateConversation(msg, account.orgId, contactId);

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
        attachments: msg.attachments ??[],
        sentAt,
      },
    });

    await updateConversationAfterMessage(conversation.id, sentAt, msg.isSelf);

    if (msg.isSelf && contactId) {
      prisma.contact.updateMany({
        where: { id: contactId, firstContactDate: null },
        data: { firstContactDate: new Date(msg.timestamp) },
      }).catch(() => {});
    }

    emitWebhook(account.orgId, msg.isSelf ? "message.sent" : "message.received", {
      messageId: message.id, conversationId: conversation.id, senderUid: msg.senderUid,
      content: msg.content, contentType: msg.contentType, sentAt: message.sentAt,
    });

    return { message, conversationId: conversation.id, orgId: account.orgId, contactId };
  } catch (err) {
    logger.error("[message-handler] handleIncomingMessage error:", err);
    return null;
  }
}

async function upsertContact(msg: IncomingMessage, orgId: string): Promise<string | null> {
  if (msg.threadType === "group") {
    const groupUid = msg.threadId;
    const groupContact = await prisma.contact.upsert({
      where: { orgId_zaloUid: { orgId, zaloUid: groupUid } },
      create: {
        id: randomUUID(), orgId, zaloUid: groupUid, fullName: msg.groupName || "Nhóm", metadata: { isGroup: true },
        zaloAccountId: msg.accountId // <--- GÁN ZALO ACCOUNT
      },
      update: {
        ...(msg.groupName ? { fullName: msg.groupName } : {}),
        zaloAccountId: msg.accountId // <--- CẬP NHẬT ZALO ACCOUNT
      },
      select: { id: true, fullName: true },
    });
    return groupContact.id;
  }

  if (msg.isSelf) {
    if (!msg.recipientUid) return null;
    const contact = await prisma.contact.upsert({
      where: { orgId_zaloUid: { orgId, zaloUid: msg.recipientUid } },
      create: {
        id: randomUUID(), orgId, zaloUid: msg.recipientUid, fullName: msg.senderName || "Unknown",
        zaloAccountId: msg.accountId // <--- GÁN ZALO ACCOUNT
      },
      update: {
        ...(msg.senderName ? { fullName: msg.senderName } : {}),
        zaloAccountId: msg.accountId // <--- CẬP NHẬT ZALO ACCOUNT
      },
      select: { id: true },
    });
    return contact.id;
  }

  const contact = await prisma.contact.upsert({
    where: { orgId_zaloUid: { orgId, zaloUid: msg.senderUid } },
    create: {
      id: randomUUID(), orgId, zaloUid: msg.senderUid, fullName: msg.senderName || "Unknown",
      zaloAccountId: msg.accountId // <--- GÁN ZALO ACCOUNT
    },
    update: {
      ...(msg.senderName ? { fullName: msg.senderName } : {}),
      zaloAccountId: msg.accountId // <--- CẬP NHẬT ZALO ACCOUNT
    },
    select: { id: true },
  });
  return contact.id;
}

async function findOrCreateConversation(msg: IncomingMessage, orgId: string, contactId: string | null) {
  const externalThreadId = msg.threadId;
  const existing = await prisma.conversation.findFirst({
    where: { zaloAccountId: msg.accountId, externalThreadId },
    select: { id: true, contactId: true },
  });

  if (existing) {
    if (!existing.contactId && contactId) {
      await prisma.conversation.update({ where: { id: existing.id }, data: { contactId } });
    }
    return existing;
  }

  return prisma.conversation.create({
    data: {
      id: randomUUID(), orgId, zaloAccountId: msg.accountId, contactId, threadType: msg.threadType,
      externalThreadId, lastMessageAt: new Date(msg.timestamp), unreadCount: msg.isSelf ? 0 : 1, isReplied: msg.isSelf,
    },
    select: { id: true, contactId: true },
  });
}

async function updateConversationAfterMessage(conversationId: string, sentAt: Date, isSelf: boolean): Promise<void> {
  const updateData: any = { lastMessageAt: sentAt };
  if (isSelf) { updateData.isReplied = true; updateData.unreadCount = 0; } 
  else { updateData.unreadCount = { increment: 1 }; updateData.isReplied = false; }
  await prisma.conversation.update({ where: { id: conversationId }, data: updateData });
}

export async function handleMessageUndo(accountId: string, zaloMsgId: string): Promise<void> {
  try {
    await prisma.message.updateMany({
      where: { zaloMsgId: String(zaloMsgId) },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  } catch (err) {
    logger.error("[message-handler] handleMessageUndo error:", err);
  }
}
