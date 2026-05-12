/**
 * chat-routes.ts — REST API for conversations and messages.
 * All routes require JWT auth and are scoped to the user's org.
 *
 * CHANGES (chat-from-contacts feature):
 *  1. GET /conversations — thêm filter `contactId` để tìm chính xác theo contact
 *  2. POST /conversations/start — tạo hoặc lấy conversation với contact từ Contacts page
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../../shared/database/prisma-client.js";
import { authMiddleware } from "../auth/auth-middleware.js";
import { requireZaloAccess } from "../zalo/zalo-access-middleware.js";
import { zaloPool } from "../zalo/zalo-pool.js";
import { zaloRateLimiter } from "../zalo/zalo-rate-limiter.js";
import { logger } from "../../shared/utils/logger.js";
import { randomUUID } from "node:crypto";
import type { Server } from "socket.io";

type QueryParams = Record<string, string>;

export async function chatRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authMiddleware);

  // ── List conversations (paginated) ──────────────────────────────────────
  // CHANGE: thêm filter contactId để ContactDrawer tìm chính xác
  app.get(
    "/api/v1/conversations",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const {
        page = "1",
        limit = "50",
        search = "",
        accountId = "",
        contactId = "", // <<< MỚI: filter theo contactId
      } = request.query as QueryParams;

      const where: any = { orgId: user.orgId };

      if (accountId) where.zaloAccountId = accountId;

      // <<< MỚI: nếu có contactId thì filter thẳng, bỏ qua search text
      if (contactId) {
        where.contactId = contactId;
      } else if (search) {
        where.contact = {
          OR: [
            { fullName: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
          ],
        };
      }

      // Members can only see conversations from Zalo accounts they have access to
      if (user.role === "member") {
        const accessibleAccounts = await prisma.zaloAccountAccess.findMany({
          where: { userId: user.id },
          select: { zaloAccountId: true },
        });
        where.zaloAccountId = {
          in: accessibleAccounts.map((a) => a.zaloAccountId),
        };
      }

      const [conversations, total] = await Promise.all([
        prisma.conversation.findMany({
          where,
          include: {
            contact: {
              select: {
                id: true,
                fullName: true,
                phone: true,
                avatarUrl: true,
                zaloUid: true,
              },
            },
            zaloAccount: {
              select: { id: true, displayName: true, zaloUid: true },
            },
            messages: {
              take: 1,
              orderBy: { sentAt: "desc" },
              select: {
                content: true,
                contentType: true,
                senderType: true,
                sentAt: true,
                isDeleted: true,
              },
            },
          },
          orderBy: { lastMessageAt: "desc" },
          skip: (parseInt(page) - 1) * parseInt(limit),
          take: parseInt(limit),
        }),
        prisma.conversation.count({ where }),
      ]);

      return {
        conversations,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
      };
    },
  );

  // ── Get single conversation ──────────────────────────────────────────────
  app.get(
    "/api/v1/conversations/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const conversation = await prisma.conversation.findFirst({
        where: { id, orgId: user.orgId },
        include: {
          contact: true,
          zaloAccount: {
            select: {
              id: true,
              displayName: true,
              zaloUid: true,
              status: true,
            },
          },
        },
      });
      if (!conversation) return reply.status(404).send({ error: "Not found" });

      return conversation;
    },
  );

  // ── START or GET conversation with a contact ─────────────────────────────
  // <<< ENDPOINT MỚI: cho phép bắt đầu chat từ trang Contacts
  // POST /api/v1/conversations/start
  // Body: { contactId: string, zaloAccountId: string }
  // Returns: { conversationId: string, isNew: boolean }
  app.post(
    "/api/v1/conversations/start",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { contactId, zaloAccountId } = request.body as {
        contactId: string;
        zaloAccountId: string;
      };

      if (!contactId || !zaloAccountId) {
        return reply
          .status(400)
          .send({ error: "contactId và zaloAccountId là bắt buộc" });
      }

      // Kiểm tra contact tồn tại và thuộc org
      const contact = await prisma.contact.findFirst({
        where: { id: contactId, orgId: user.orgId },
        select: { id: true, fullName: true, zaloUid: true },
      });

      if (!contact) {
        return reply.status(404).send({ error: "Không tìm thấy khách hàng" });
      }

      if (!contact.zaloUid) {
        return reply.status(400).send({
          error:
            "Khách hàng này chưa có Zalo UID. Chat chỉ khả dụng khi họ đã từng nhắn tin qua Zalo.",
        });
      }

      // Kiểm tra Zalo account thuộc org
      const zaloAccount = await prisma.zaloAccount.findFirst({
        where: { id: zaloAccountId, orgId: user.orgId },
        select: { id: true, displayName: true, zaloUid: true, status: true },
      });

      if (!zaloAccount) {
        return reply
          .status(404)
          .send({ error: "Không tìm thấy tài khoản Zalo" });
      }

      // Kiểm tra Zalo account đang kết nối
      const instance = zaloPool.getInstance(zaloAccountId);
      if (!instance?.api) {
        return reply.status(400).send({
          error: `Tài khoản Zalo "${zaloAccount.displayName || zaloAccountId}" chưa kết nối. Vui lòng kết nối lại trong Cài đặt.`,
        });
      }

      // Tìm conversation hiện có (theo externalThreadId = zaloUid của contact)
      const existing = await prisma.conversation.findFirst({
        where: {
          zaloAccountId,
          externalThreadId: contact.zaloUid,
          orgId: user.orgId,
        },
        select: { id: true },
      });

      if (existing) {
        return { conversationId: existing.id, isNew: false };
      }

      // Tạo conversation mới
      const conv = await prisma.conversation.create({
        data: {
          id: randomUUID(),
          orgId: user.orgId,
          zaloAccountId,
          contactId: contact.id,
          threadType: "user",
          externalThreadId: contact.zaloUid,
          lastMessageAt: new Date(),
          unreadCount: 0,
          isReplied: true,
        },
        select: { id: true },
      });

      logger.info(
        `[chat] Created new conversation for contact ${contact.id} via account ${zaloAccountId}`,
      );

      return { conversationId: conv.id, isNew: true };
    },
  );

  // ── List messages for a conversation (paginated, newest first) ──────────
  app.get(
    "/api/v1/conversations/:id/messages",
    { preHandler: requireZaloAccess("read") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const { page = "1", limit = "50" } = request.query as QueryParams;

      const conversation = await prisma.conversation.findFirst({
        where: { id, orgId: user.orgId },
        select: { id: true },
      });
      if (!conversation)
        return reply.status(404).send({ error: "Conversation not found" });

      const [messages, total] = await Promise.all([
        prisma.message.findMany({
          where: { conversationId: id },
          orderBy: { sentAt: "desc" },
          skip: (parseInt(page) - 1) * parseInt(limit),
          take: parseInt(limit),
        }),
        prisma.message.count({ where: { conversationId: id } }),
      ]);

      return {
        messages: messages.reverse(),
        total,
        page: parseInt(page),
        limit: parseInt(limit),
      };
    },
  );

  // ── Send message ─────────────────────────────────────────────────────────
  app.post(
    "/api/v1/conversations/:id/messages",
    { preHandler: requireZaloAccess("chat") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const { content } = request.body as { content: string };

      if (!content?.trim())
        return reply.status(400).send({ error: "Content required" });

      const conversation = await prisma.conversation.findFirst({
        where: { id, orgId: user.orgId },
        include: { zaloAccount: true },
      });
      if (!conversation)
        return reply.status(404).send({ error: "Conversation not found" });

      const instance = zaloPool.getInstance(conversation.zaloAccountId);
      if (!instance?.api)
        return reply.status(400).send({ error: "Zalo account not connected" });

      // Rate limit check — prevent account blocking
      const limits = zaloRateLimiter.checkLimits(conversation.zaloAccountId);
      if (!limits.allowed) {
        return reply.status(429).send({ error: limits.reason });
      }

      try {
        const threadId = conversation.externalThreadId || "";
        // zca-js sendMessage(message, threadId, type) — type: 0=User, 1=Group
        const threadType = conversation.threadType === "group" ? 1 : 0;

        zaloRateLimiter.recordSend(conversation.zaloAccountId);
        await instance.api.sendMessage({ msg: content }, threadId, threadType);

        const message = await prisma.message.create({
          data: {
            id: randomUUID(),
            conversationId: id,
            senderType: "self",
            senderUid: conversation.zaloAccount.zaloUid || "",
            senderName: "Staff",
            content,
            contentType: "text",
            sentAt: new Date(),
            repliedByUserId: user.id,
          },
        });

        await prisma.conversation.update({
          where: { id },
          data: { lastMessageAt: new Date(), isReplied: true, unreadCount: 0 },
        });

        const io = (app as any).io as Server;
        io?.emit("chat:message", {
          accountId: conversation.zaloAccountId,
          message,
          conversationId: id,
        });

        return message;
      } catch (err) {
        logger.error("[chat] Send message error:", err);
        return reply.status(500).send({ error: "Failed to send message" });
      }
    },
  );

  // ── Mark conversation as read ────────────────────────────────────────────
  app.post(
    "/api/v1/conversations/:id/mark-read",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      await prisma.conversation.updateMany({
        where: { id, orgId: user.orgId },
        data: { unreadCount: 0 },
      });

      return { success: true };
    },
  );
}
