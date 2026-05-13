import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { randomUUID } from 'node:crypto';
import { logger } from '../../shared/utils/logger.js';
const VALID_PERMISSIONS = ['read', 'chat', 'admin'];
export async function zaloAccessRoutes(app) {
    app.addHook('preHandler', authMiddleware);
    // GET /api/v1/zalo-accounts/:id/access — list users with access to this account
    app.get('/api/v1/zalo-accounts/:id/access', async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const account = await prisma.zaloAccount.findFirst({ where: { id, orgId: user.orgId } });
        if (!account)
            return reply.status(404).send({ error: 'Zalo account not found' });
        const accessList = await prisma.zaloAccountAccess.findMany({
            where: { zaloAccountId: id },
            include: { user: { select: { id: true, fullName: true, email: true, role: true } } },
            orderBy: { createdAt: 'asc' },
        });
        return { access: accessList };
    });
    // POST /api/v1/zalo-accounts/:id/access — grant access { userId, permission } (owner/admin only)
    app.post('/api/v1/zalo-accounts/:id/access', { preHandler: requireRole('owner', 'admin') }, async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const { userId, permission = 'read' } = request.body;
        if (!userId)
            return reply.status(400).send({ error: 'userId là bắt buộc' });
        if (!VALID_PERMISSIONS.includes(permission)) {
            return reply.status(400).send({ error: 'permission phải là read, chat hoặc admin' });
        }
        const account = await prisma.zaloAccount.findFirst({ where: { id, orgId: user.orgId } });
        if (!account)
            return reply.status(404).send({ error: 'Zalo account not found' });
        const targetUser = await prisma.user.findFirst({ where: { id: userId, orgId: user.orgId } });
        if (!targetUser)
            return reply.status(404).send({ error: 'User not found in org' });
        try {
            const access = await prisma.zaloAccountAccess.create({
                data: { id: randomUUID(), zaloAccountId: id, userId, permission },
                include: { user: { select: { id: true, fullName: true, email: true } } },
            });
            logger.info(`Zalo access granted: ${targetUser.email} → account ${id} (${permission}) by ${user.email}`);
            return reply.status(201).send(access);
        }
        catch {
            // Unique constraint violation — access already exists
            return reply.status(409).send({ error: 'User đã có quyền truy cập tài khoản này' });
        }
    });
    // PUT /api/v1/zalo-accounts/:id/access/:accessId — update permission (owner/admin only)
    app.put('/api/v1/zalo-accounts/:id/access/:accessId', { preHandler: requireRole('owner', 'admin') }, async (request, reply) => {
        const user = request.user;
        const { id, accessId } = request.params;
        const { permission } = request.body;
        if (!VALID_PERMISSIONS.includes(permission)) {
            return reply.status(400).send({ error: 'permission phải là read, chat hoặc admin' });
        }
        const account = await prisma.zaloAccount.findFirst({ where: { id, orgId: user.orgId } });
        if (!account)
            return reply.status(404).send({ error: 'Zalo account not found' });
        try {
            const access = await prisma.zaloAccountAccess.update({
                where: { id: accessId, zaloAccountId: id },
                data: { permission },
                include: { user: { select: { id: true, fullName: true, email: true } } },
            });
            logger.info(`Zalo access updated: accessId ${accessId} → ${permission} by ${user.email}`);
            return access;
        }
        catch {
            return reply.status(404).send({ error: 'Access record not found' });
        }
    });
    // DELETE /api/v1/zalo-accounts/:id/access/:accessId — revoke access (owner/admin only)
    app.delete('/api/v1/zalo-accounts/:id/access/:accessId', { preHandler: requireRole('owner', 'admin') }, async (request, reply) => {
        const user = request.user;
        const { id, accessId } = request.params;
        const account = await prisma.zaloAccount.findFirst({ where: { id, orgId: user.orgId } });
        if (!account)
            return reply.status(404).send({ error: 'Zalo account not found' });
        try {
            await prisma.zaloAccountAccess.delete({ where: { id: accessId, zaloAccountId: id } });
            logger.info(`Zalo access revoked: accessId ${accessId} by ${user.email}`);
            return reply.status(204).send();
        }
        catch {
            return reply.status(404).send({ error: 'Access record not found' });
        }
    });
}
//# sourceMappingURL=zalo-access-routes.js.map