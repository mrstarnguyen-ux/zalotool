import { prisma } from "../../shared/database/prisma-client.js";
import { authMiddleware } from "../auth/auth-middleware.js";
import { requireZaloAccess } from "../zalo/zalo-access-middleware.js";
import { zaloPool } from "../zalo/zalo-pool.js";
import { zaloRateLimiter } from "../zalo/zalo-rate-limiter.js";
import { logger } from "../../shared/utils/logger.js";
import { randomUUID } from "node:crypto";
export async function chatRoutes(app) {
    app.addHook("preHandler", authMiddleware);
    async function getChatScopeWhereClause(user) {
        const currentUser = await prisma.user.findUnique({
            where: { id: user.id },
            include: { customRole: true }
        });
        let dataScope = 'self';
        if (currentUser?.role === 'owner' || currentUser?.role === 'admin') {
            dataScope = 'all';
        }
        else if (currentUser?.customRole?.permissions) {
            dataScope = currentUser.customRole.permissions.dataScope || 'self';
        }
        let scopeWhere = {};
        if (dataScope === 'self') {
            if (currentUser?.assignedZaloAccountId) {
                scopeWhere.zaloAccountId = currentUser.assignedZaloAccountId;
            }
            else {
                scopeWhere.zaloAccountId = 'none';
            }
        }
        else if (dataScope === 'team') {
            if (currentUser?.teamId) {
                const teamMembers = await prisma.user.findMany({
                    where: { teamId: currentUser.teamId, assignedZaloAccountId: { not: null } },
                    select: { assignedZaloAccountId: true }
                });
                const zaloIds = teamMembers.map((a) => a.assignedZaloAccountId).filter(Boolean); // <--- ĐÃ SỬA DÒNG NÀY
                scopeWhere.zaloAccountId = { in: zaloIds };
            }
            else if (currentUser?.assignedZaloAccountId) {
                scopeWhere.zaloAccountId = currentUser.assignedZaloAccountId;
            }
            else {
                scopeWhere.zaloAccountId = 'none';
            }
        }
        return scopeWhere;
    }
    app.get("/api/v1/conversations", async (request, reply) => {
        const user = request.user;
        const { page = "1", limit = "50", search = "", accountId = "", contactId = "" } = request.query;
        const scopeWhere = await getChatScopeWhereClause(user);
        const where = { orgId: user.orgId, ...scopeWhere };
        if (accountId)
            where.zaloAccountId = accountId;
        if (contactId) {
            where.contactId = contactId;
        }
        else if (search) {
            where.contact = { OR: [{ fullName: { contains: search, mode: "insensitive" } }, { phone: { contains: search } }] };
        }
        const [conversations, total] = await Promise.all([
            prisma.conversation.findMany({
                where,
                include: {
                    contact: { select: { id: true, fullName: true, phone: true, avatarUrl: true, zaloUid: true } },
                    zaloAccount: { select: { id: true, displayName: true, zaloUid: true } },
                    labels: true, // <--- ĐÃ THÊM DÒNG NÀY
                    messages: { take: 1, orderBy: { sentAt: "desc" }, select: { content: true, contentType: true, senderType: true, sentAt: true, isDeleted: true, zaloMsgId: true } },
                },
                orderBy: { lastMessageAt: "desc" },
                skip: (parseInt(page) - 1) * parseInt(limit),
                take: parseInt(limit),
            }),
            prisma.conversation.count({ where }),
        ]);
        return { conversations, total, page: parseInt(page), limit: parseInt(limit) };
    });
    app.get("/api/v1/conversations/:id", async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const scopeWhere = await getChatScopeWhereClause(user);
        const conversation = await prisma.conversation.findFirst({
            where: { id, orgId: user.orgId, ...scopeWhere },
            include: {
                contact: true,
                labels: true, // <--- ĐÃ THÊM DÒNG NÀY
                zaloAccount: { select: { id: true, displayName: true, zaloUid: true, status: true } },
            },
        });
        if (!conversation)
            return reply.status(404).send({ error: "Not found or access denied" });
        return conversation;
    });
    app.post("/api/v1/conversations/start", async (request, reply) => {
        const user = request.user;
        const { contactId, zaloAccountId } = request.body;
        if (!contactId || !zaloAccountId)
            return reply.status(400).send({ error: "contactId và zaloAccountId là bắt buộc" });
        const contact = await prisma.contact.findFirst({ where: { id: contactId, orgId: user.orgId }, select: { id: true, fullName: true, zaloUid: true } });
        if (!contact)
            return reply.status(404).send({ error: "Không tìm thấy khách hàng" });
        if (!contact.zaloUid)
            return reply.status(400).send({ error: "Khách hàng này chưa có Zalo UID." });
        const zaloAccount = await prisma.zaloAccount.findFirst({ where: { id: zaloAccountId, orgId: user.orgId }, select: { id: true, displayName: true, zaloUid: true, status: true } });
        if (!zaloAccount)
            return reply.status(404).send({ error: "Không tìm thấy tài khoản Zalo" });
        const instance = zaloPool.getInstance(zaloAccountId);
        if (!instance?.api)
            return reply.status(400).send({ error: `Tài khoản Zalo chưa kết nối.` });
        const existing = await prisma.conversation.findFirst({ where: { zaloAccountId, externalThreadId: contact.zaloUid, orgId: user.orgId }, select: { id: true } });
        if (existing)
            return { conversationId: existing.id, isNew: false };
        const conv = await prisma.conversation.create({
            data: { id: randomUUID(), orgId: user.orgId, zaloAccountId, contactId: contact.id, threadType: "user", externalThreadId: contact.zaloUid, lastMessageAt: new Date(), unreadCount: 0, isReplied: true },
            select: { id: true },
        });
        return { conversationId: conv.id, isNew: true };
    });
    app.get("/api/v1/conversations/:id/messages", { preHandler: requireZaloAccess("read") }, async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const { page = "1", limit = "50" } = request.query;
        const scopeWhere = await getChatScopeWhereClause(user);
        const conversation = await prisma.conversation.findFirst({ where: { id, orgId: user.orgId, ...scopeWhere }, select: { id: true } });
        if (!conversation)
            return reply.status(404).send({ error: "Conversation not found or access denied" });
        const [messages, total] = await Promise.all([
            prisma.message.findMany({ where: { conversationId: id }, orderBy: { sentAt: "desc" }, skip: (parseInt(page) - 1) * parseInt(limit), take: parseInt(limit) }),
            prisma.message.count({ where: { conversationId: id } }),
        ]);
        return { messages: messages.reverse(), total, page: parseInt(page), limit: parseInt(limit) };
    });
    app.post("/api/v1/conversations/:id/messages", { preHandler: requireZaloAccess("chat") }, async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const { content } = request.body;
        if (!content?.trim())
            return reply.status(400).send({ error: "Content required" });
        const scopeWhere = await getChatScopeWhereClause(user);
        const conversation = await prisma.conversation.findFirst({ where: { id, orgId: user.orgId, ...scopeWhere }, include: { zaloAccount: true } });
        if (!conversation)
            return reply.status(404).send({ error: "Conversation not found or access denied" });
        const instance = zaloPool.getInstance(conversation.zaloAccountId);
        if (!instance?.api)
            return reply.status(400).send({ error: "Zalo account not connected" });
        const limits = zaloRateLimiter.checkLimits(conversation.zaloAccountId);
        if (!limits.allowed)
            return reply.status(429).send({ error: limits.reason });
        try {
            const threadId = conversation.externalThreadId || "";
            const threadType = conversation.threadType === "group" ? 1 : 0;
            zaloRateLimiter.recordSend(conversation.zaloAccountId);
            // 1. Lấy kết quả trả về từ Zalo để lấy ID tin nhắn thật
            const zaloResult = await instance.api.sendMessage({ msg: content }, threadId, threadType);
            const zaloMsgId = zaloResult?.data?.msgId || zaloResult?.msgId || null;
            const message = await prisma.message.create({
                data: { id: randomUUID(), conversationId: id, zaloMsgId: zaloMsgId ? String(zaloMsgId) : null, senderType: "self", senderUid: conversation.zaloAccount.zaloUid || "", senderName: "Staff", content, contentType: "text", sentAt: new Date(), repliedByUserId: user.id },
            });
            await prisma.conversation.update({ where: { id }, data: { lastMessageAt: new Date(), isReplied: true, unreadCount: 0 } });
            const io = app.io;
            io?.emit("chat:message", { accountId: conversation.zaloAccountId, message, conversationId: id });
            return message;
        }
        catch (err) {
            logger.error("[chat] Send message error:", err);
            return reply.status(500).send({ error: "Failed to send message" });
        }
    });
    app.post("/api/v1/conversations/:id/mark-read", async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const scopeWhere = await getChatScopeWhereClause(user);
        const conversation = await prisma.conversation.findFirst({ where: { id, orgId: user.orgId, ...scopeWhere }, select: { id: true } });
        if (!conversation)
            return reply.status(404).send({ error: "Conversation not found or access denied" });
        await prisma.conversation.update({ where: { id }, data: { unreadCount: 0 } });
        return { success: true };
    });
    app.put("/api/v1/conversations/:id/labels", async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const { labelIds } = request.body;
        const scopeWhere = await getChatScopeWhereClause(user);
        const conversation = await prisma.conversation.findFirst({ where: { id, orgId: user.orgId, ...scopeWhere }, select: { id: true } });
        if (!conversation)
            return reply.status(404).send({ error: "Conversation not found or access denied" });
        const validLabels = await prisma.conversationLabel.findMany({ where: { id: { in: labelIds }, orgId: user.orgId }, select: { id: true } });
        const validLabelIds = validLabels.map(l => l.id);
        await prisma.conversation.update({ where: { id }, data: { labels: { set: validLabelIds.map(labelId => ({ id: labelId })) } } });
        return { success: true };
    });
}
//# sourceMappingURL=chat-routes.js.map