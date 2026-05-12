import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from './auth-middleware.js';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

export async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/users', async (request: FastifyRequest) => {
    const user = request.user!;
    const users = await prisma.user.findMany({
      where: { orgId: user.orgId },
      select: {
        id: true, email: true, fullName: true, role: true, roleId: true, isActive: true, teamId: true, createdAt: true,
        assignedZaloAccountId: true, // <--- Lấy trường này
        team: { select: { id: true, name: true } },
        customRole: { select: { id: true, name: true } },
        assignedZaloAccount: { select: { id: true, displayName: true } } // <--- Lấy tên Zalo
      },
      orderBy: { createdAt: 'asc' },
    });
    return { users };
  });

  app.post('/api/v1/users', async (request: FastifyRequest, reply: FastifyReply) => {
    const currentUser = request.user!;
    if (!['owner', 'admin'].includes(currentUser.role)) return reply.status(403).send({ error: 'Không có quyền' });

    const { email, fullName, password, roleId, teamId, assignedZaloAccountId } = request.body as any;
    if (!email || !fullName || !password || !roleId) return reply.status(400).send({ error: 'Email, họ tên, mật khẩu, nhóm quyền là bắt buộc' });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return reply.status(400).send({ error: 'Email đã tồn tại' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        id: randomUUID(), orgId: currentUser.orgId, email, fullName, passwordHash, role: 'member', 
        roleId, teamId: teamId || null, assignedZaloAccountId: assignedZaloAccountId || null
      },
      select: { id: true, email: true, fullName: true, role: true, isActive: true, createdAt: true },
    });
    return user;
  });

  app.put('/api/v1/users/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const currentUser = request.user!;
    const { id } = request.params as { id: string };

    if (!['owner', 'admin'].includes(currentUser.role) && currentUser.id !== id) return reply.status(403).send({ error: 'Không có quyền' });

    const { fullName, email, roleId, teamId, assignedZaloAccountId, isActive } = request.body as any;
    const updateData: any = {};
    if (fullName !== undefined) updateData.fullName = fullName;
    if (email !== undefined) updateData.email = email;
    if (roleId !== undefined && currentUser.role === 'owner') updateData.roleId = roleId;
    if (teamId !== undefined) updateData.teamId = teamId || null;
    if (assignedZaloAccountId !== undefined) updateData.assignedZaloAccountId = assignedZaloAccountId || null;
    if (isActive !== undefined && currentUser.role === 'owner') updateData.isActive = isActive;

    const user = await prisma.user.update({
      where: { id, orgId: currentUser.orgId },
      data: updateData,
      select: { id: true, email: true, fullName: true, role: true, roleId: true, isActive: true, teamId: true, assignedZaloAccountId: true },
    });
    return user;
  });

  app.put('/api/v1/users/:id/password', async (request: FastifyRequest, reply: FastifyReply) => {
    const currentUser = request.user!;
    if (!['owner', 'admin'].includes(currentUser.role)) return reply.status(403).send({ error: 'Không có quyền' });
    const { id } = request.params as { id: string };
    const { password } = request.body as { password: string };
    if (!password || password.length < 6) return reply.status(400).send({ error: 'Mật khẩu tối thiểu 6 ký tự' });
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: { id, orgId: currentUser.orgId }, data: { passwordHash } });
    return { success: true };
  });

  app.delete('/api/v1/users/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const currentUser = request.user!;
    if (currentUser.role !== 'owner') return reply.status(403).send({ error: 'Chỉ owner có quyền xóa nhân viên' });
    const { id } = request.params as { id: string };
    if (id === currentUser.id) return reply.status(400).send({ error: 'Không thể xóa chính mình' });
    await prisma.user.update({ where: { id, orgId: currentUser.orgId }, data: { isActive: false } });
    return { success: true };
  });
}
