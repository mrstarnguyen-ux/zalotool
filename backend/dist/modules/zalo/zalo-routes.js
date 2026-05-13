import { authMiddleware } from '../auth/auth-middleware.js';
import { zaloPool } from './zalo-pool.js';
import { prisma } from '../../shared/database/prisma-client.js';
export async function zaloRoutes(app) {
    app.addHook('preHandler', authMiddleware);
    app.get('/api/v1/zalo-accounts', async (request) => {
        const user = request.user;
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
        let whereClause = { orgId: user.orgId };
        if (dataScope === 'self') {
            whereClause.OR = [{ ownerUserId: user.id }];
            if (currentUser?.assignedZaloAccountId) {
                whereClause.OR.push({ id: currentUser.assignedZaloAccountId });
            }
        }
        else if (dataScope === 'team') {
            if (currentUser?.teamId) {
                whereClause.owner = { teamId: currentUser.teamId };
            }
            else {
                whereClause.OR = [{ ownerUserId: user.id }];
                if (currentUser?.assignedZaloAccountId) {
                    whereClause.OR.push({ id: currentUser.assignedZaloAccountId });
                }
            }
        }
        const accounts = await prisma.zaloAccount.findMany({
            where: whereClause,
            select: {
                id: true, zaloUid: true, displayName: true, avatarUrl: true,
                phone: true, status: true, lastConnectedAt: true, createdAt: true,
                owner: { select: { id: true, fullName: true, email: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
        return accounts.map((a) => ({ ...a, liveStatus: zaloPool.getStatus(a.id) })); // <--- ĐÃ SỬA DÒNG NÀY
    });
    app.post('/api/v1/zalo-accounts', async (request, reply) => {
        const user = request.user;
        const { displayName } = request.body ?? {};
        const account = await prisma.zaloAccount.create({
            data: { orgId: user.orgId, ownerUserId: user.id, displayName: displayName ?? null, status: 'qr_pending' },
        });
        return reply.status(201).send(account);
    });
    app.patch('/api/v1/zalo-accounts/:id', async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const { displayName } = request.body;
        if (!displayName?.trim())
            return reply.status(400).send({ error: "Tên không được để trống" });
        const account = await prisma.zaloAccount.findFirst({ where: { id, orgId: user.orgId } });
        if (!account)
            return reply.status(404).send({ error: "Không tìm thấy tài khoản" });
        return await prisma.zaloAccount.update({ where: { id }, data: { displayName: displayName.trim() } });
    });
    app.post('/api/v1/zalo-accounts/:id/login', async (request, reply) => {
        const { id } = request.params;
        const user = request.user;
        const account = await prisma.zaloAccount.findFirst({ where: { id, orgId: user.orgId } });
        if (!account)
            return reply.status(404).send({ error: 'Account not found' });
        zaloPool.loginQR(id).catch(() => { });
        return { message: 'QR login initiated' };
    });
    app.post('/api/v1/zalo-accounts/:id/reconnect', async (request, reply) => {
        const { id } = request.params;
        const user = request.user;
        const account = await prisma.zaloAccount.findFirst({ where: { id, orgId: user.orgId } });
        if (!account)
            return reply.status(404).send({ error: 'Account not found' });
        const session = account.sessionData;
        if (!session?.imei)
            return reply.status(400).send({ error: 'No saved session' });
        zaloPool.reconnect(id, session).catch(() => { });
        return { message: 'Reconnect initiated' };
    });
    app.delete('/api/v1/zalo-accounts/:id', async (request, reply) => {
        const { id } = request.params;
        const user = request.user;
        const account = await prisma.zaloAccount.findFirst({ where: { id, orgId: user.orgId } });
        if (!account)
            return reply.status(404).send({ error: 'Account not found' });
        zaloPool.disconnect(id);
        await prisma.zaloAccount.delete({ where: { id } });
        return reply.status(204).send();
    });
    app.get('/api/v1/zalo-accounts/:id/status', async (request, reply) => {
        const { id } = request.params;
        const user = request.user;
        const account = await prisma.zaloAccount.findFirst({ where: { id, orgId: user.orgId } });
        if (!account)
            return reply.status(404).send({ error: 'Account not found' });
        return { accountId: id, liveStatus: zaloPool.getStatus(id) };
    });
}
//# sourceMappingURL=zalo-routes.js.map