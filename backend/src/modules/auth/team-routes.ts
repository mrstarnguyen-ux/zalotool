import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from './auth-middleware.js';
import { randomUUID } from 'node:crypto';

export async function teamRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/teams', async (request: FastifyRequest) => {
    const user = request.user!;
    const teams = await prisma.team.findMany({
      where: { orgId: user.orgId },
      include: {
        manager: { select: { id: true, fullName: true, email: true } },
        _count: { select: { users: true } }
      },
      orderBy: { createdAt: 'asc' }
    });
    return teams;
  });

  app.post('/api/v1/teams', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { name, managerId } = request.body as any;
    if (!name) return reply.status(400).send({ error: 'Tên đội nhóm là bắt buộc' });

    const team = await prisma.team.create({
      data: {
        id: randomUUID(),
        orgId: user.orgId,
        name,
        managerId: managerId || null
      }
    });
    return reply.status(201).send(team);
  });

  app.put('/api/v1/teams/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { name, managerId } = request.body as any;

    const existing = await prisma.team.findFirst({ where: { id, orgId: user.orgId } });
    if (!existing) return reply.status(404).send({ error: 'Không tìm thấy đội nhóm' });

    const updated = await prisma.team.update({
      where: { id },
      data: { name, managerId: managerId || null }
    });
    return updated;
  });

  app.delete('/api/v1/teams/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    
    const existing = await prisma.team.findFirst({ where: { id, orgId: user.orgId } });
    if (!existing) return reply.status(404).send({ error: 'Không tìm thấy đội nhóm' });

    await prisma.team.delete({ where: { id } });
    return reply.status(204).send();
  });
}
