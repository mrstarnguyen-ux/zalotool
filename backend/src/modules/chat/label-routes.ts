import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { randomUUID } from 'node:crypto';

export async function labelRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // 1. Lấy danh sách Nhãn
  app.get('/api/v1/labels', async (request: FastifyRequest) => {
    const user = request.user!;
    const labels = await prisma.conversationLabel.findMany({
      where: { orgId: user.orgId },
      orderBy: { createdAt: 'asc' }
    });
    return labels;
  });

  // 2. Tạo Nhãn mới
  app.post('/api/v1/labels', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { name, color } = request.body as any;
    if (!name) return reply.status(400).send({ error: 'Tên nhãn là bắt buộc' });

    const label = await prisma.conversationLabel.create({
      data: { id: randomUUID(), orgId: user.orgId, name, color: color || '#1976D2' }
    });
    return reply.status(201).send(label);
  });

  // 3. Cập nhật Nhãn
  app.put('/api/v1/labels/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { name, color } = request.body as any;

    const existing = await prisma.conversationLabel.findFirst({ where: { id, orgId: user.orgId } });
    if (!existing) return reply.status(404).send({ error: 'Không tìm thấy nhãn' });

    const updated = await prisma.conversationLabel.update({
      where: { id }, data: { name, color }
    });
    return updated;
  });

  // 4. Xóa Nhãn
  app.delete('/api/v1/labels/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    
    const existing = await prisma.conversationLabel.findFirst({ where: { id, orgId: user.orgId } });
    if (!existing) return reply.status(404).send({ error: 'Không tìm thấy nhãn' });

    await prisma.conversationLabel.delete({ where: { id } });
    return reply.status(204).send();
  });
}
