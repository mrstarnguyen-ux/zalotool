import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from './auth-middleware.js';

export async function roleRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // 1. Lấy danh sách Nhóm vai trò
  app.get('/api/v1/roles', async (request: FastifyRequest) => {
    const user = request.user!;
    const roles = await prisma.role.findMany({
      where: { orgId: user.orgId },
      orderBy: { createdAt: 'asc' }
    });
    return roles;
  });

  // 2. Tạo Nhóm vai trò mới
  app.post('/api/v1/roles', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { name, description, permissions } = request.body as any;

    if (!name) return reply.status(400).send({ error: 'Tên nhóm vai trò là bắt buộc' });

    const role = await prisma.role.create({
      data: {
        orgId: user.orgId,
        name,
        description: description || '',
        permissions: permissions || {},
        isSystem: false
      }
    });
    return reply.status(201).send(role);
  });

  // 3. Cập nhật Nhóm vai trò
  app.put('/api/v1/roles/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { name, description, permissions } = request.body as any;

    const existing = await prisma.role.findFirst({ where: { id, orgId: user.orgId } });
    if (!existing) return reply.status(404).send({ error: 'Không tìm thấy nhóm vai trò' });
    if (existing.isSystem) return reply.status(403).send({ error: 'Không thể sửa quyền hệ thống mặc định' });

    const updated = await prisma.role.update({
      where: { id },
      data: { name, description, permissions }
    });
    return updated;
  });

  // 4. Xóa Nhóm vai trò
  app.delete('/api/v1/roles/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const existing = await prisma.role.findFirst({ where: { id, orgId: user.orgId } });
    if (!existing) return reply.status(404).send({ error: 'Không tìm thấy nhóm vai trò' });
    if (existing.isSystem) return reply.status(403).send({ error: 'Không thể xóa quyền hệ thống mặc định' });

    // Kiểm tra xem có user nào đang dùng role này không
    const usersWithRole = await prisma.user.count({ where: { roleId: id } });
    if (usersWithRole > 0) {
      return reply.status(400).send({ error: `Không thể xóa vì đang có ${usersWithRole} nhân viên sử dụng nhóm quyền này.` });
    }

    await prisma.role.delete({ where: { id } });
    return reply.status(204).send();
  });
}
