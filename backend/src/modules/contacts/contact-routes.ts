import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';

type QueryParams = Record<string, string>;

export async function contactRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  async function getContactScopeWhereClause(user: any) {
    const currentUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { customRole: true }
    });

    let dataScope = 'self';
    if (currentUser?.role === 'owner' || currentUser?.role === 'admin') {
      dataScope = 'all';
    } else if (currentUser?.customRole?.permissions) {
      dataScope = (currentUser.customRole.permissions as any).dataScope || 'self';
    }

    let scopeWhere: any = {};
    if (dataScope === 'self') {
      if (currentUser?.assignedZaloAccountId) {
        scopeWhere.zaloAccountId = currentUser.assignedZaloAccountId;
      } else {
        scopeWhere.zaloAccountId = 'none'; // Không có Zalo thì không thấy ai
      }
    } else if (dataScope === 'team') {
      if (currentUser?.teamId) {
        const teamMembers = await prisma.user.findMany({
          where: { teamId: currentUser.teamId, assignedZaloAccountId: { not: null } },
          select: { assignedZaloAccountId: true }
        });
        const zaloIds = teamMembers.map((m: { assignedZaloAccountId: string | null }) => m.assignedZaloAccountId).filter(Boolean); // <--- ĐÃ SỬA DÒNG NÀY
        scopeWhere.zaloAccountId = { in: zaloIds };
      } else if (currentUser?.assignedZaloAccountId) {
        scopeWhere.zaloAccountId = currentUser.assignedZaloAccountId;
      } else {
        scopeWhere.zaloAccountId = 'none';
      }
    }
    return scopeWhere;
  }

  app.get('/api/v1/contacts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { page = '1', limit = '50', search = '', source = '', status = '', assignedUserId = '' } = request.query as QueryParams;

      const scopeWhere = await getContactScopeWhereClause(user);
      const where: any = { orgId: user.orgId, ...scopeWhere };
      
      if (source) where.source = source;
      if (status) where.status = status;
      if (assignedUserId) where.assignedUserId = assignedUserId;
      if (search) {
        where.OR = [
          { fullName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { email: { contains: search, mode: 'insensitive' } },
        ];
      }

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      const [contacts, total] = await Promise.all([
        prisma.contact.findMany({
          where,
          include: {
            assignedUser: { select: { id: true, fullName: true, email: true } },
            _count: { select: { conversations: true, appointments: true } },
          },
          orderBy: { updatedAt: 'desc' },
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
        }),
        prisma.contact.count({ where }),
      ]);

      return { contacts, total, page: pageNum, limit: limitNum };
    } catch (err) {
      logger.error('[contacts] List error:', err);
      return reply.status(500).send({ error: 'Failed to fetch contacts' });
    }
  });

  app.get('/api/v1/contacts/pipeline', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const orgId = user.orgId;
      const scopeWhere = await getContactScopeWhereClause(user);

      const pipeline = await prisma.contact.groupBy({
        by: ['status'],
        where: { orgId, status: { not: null }, ...scopeWhere },
        _count: true,
      });

      const statuses = pipeline.map((g: { status: string | null }) => g.status ?? 'unknown'); // <--- ĐÃ SỬA DÒNG NÀY
      const contactsByStatus: Record<string, any[]> = {};

      await Promise.all(
        statuses.map(async (st: string) => { // <--- ĐÃ SỬA DÒNG NÀY
          const where: any = { orgId, status: st ?? null, ...scopeWhere };
          const contacts = await prisma.contact.findMany({
            where,
            select: {
              id: true, fullName: true, phone: true, email: true, avatarUrl: true,
              status: true, nextAppointment: true, assignedUser: { select: { id: true, fullName: true } },
            },
            orderBy: { updatedAt: 'desc' },
            take: 20,
          });
          contactsByStatus[st ?? 'unknown'] = contacts;
        }),
      );

      const result = pipeline.map((g: { status: string | null; _count: number }) => ({ // <--- ĐÃ SỬA DÒNG NÀY
        status: g.status ?? 'unknown',
        count: g._count,
        contacts: contactsByStatus[g.status ?? 'unknown'] ??[],
      }));

      return { pipeline: result };
    } catch (err) {
      logger.error('[contacts] Pipeline error:', err);
      return reply.status(500).send({ error: 'Failed to fetch pipeline' });
    }
  });

  app.get('/api/v1/contacts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const scopeWhere = await getContactScopeWhereClause(user);

      const contact = await prisma.contact.findFirst({
        where: { id, orgId: user.orgId, ...scopeWhere },
        include: {
          assignedUser: { select: { id: true, fullName: true, email: true } },
          appointments: { orderBy: { appointmentDate: 'desc' }, take: 10 },
          _count: { select: { conversations: true } },
        },
      });

      if (!contact) return reply.status(404).send({ error: 'Contact not found or access denied' });
      return contact;
    } catch (err) {
      logger.error('[contacts] Detail error:', err);
      return reply.status(500).send({ error: 'Failed to fetch contact' });
    }
  });

  app.post('/api/v1/contacts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const body = request.body as Record<string, any>;

      const contact = await prisma.contact.create({
        data: {
          orgId: user.orgId, fullName: body.fullName, phone: body.phone, email: body.email,
          zaloUid: body.zaloUid, avatarUrl: body.avatarUrl, source: body.source,
          sourceDate: body.sourceDate ? new Date(body.sourceDate) : undefined,
          status: body.status ?? 'new',
          nextAppointment: body.nextAppointment ? new Date(body.nextAppointment) : undefined,
          assignedUserId: body.assignedUserId, notes: body.notes, tags: body.tags ??[], metadata: body.metadata ?? {},
        },
      });

      return reply.status(201).send(contact);
    } catch (err) {
      logger.error('[contacts] Create error:', err);
      return reply.status(500).send({ error: 'Failed to create contact' });
    }
  });

  app.put('/api/v1/contacts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, any>;
      const scopeWhere = await getContactScopeWhereClause(user);

      const existing = await prisma.contact.findFirst({ where: { id, orgId: user.orgId, ...scopeWhere }, select: { id: true } });
      if (!existing) return reply.status(404).send({ error: 'Contact not found or access denied' });

      const updateData: any = {
        fullName: body.fullName, phone: body.phone, email: body.email, avatarUrl: body.avatarUrl,
        source: body.source, sourceDate: body.sourceDate ? new Date(body.sourceDate) : undefined,
        status: body.status, nextAppointment: body.nextAppointment ? new Date(body.nextAppointment) : undefined,
        assignedUserId: body.assignedUserId, notes: body.notes, tags: body.tags, metadata: body.metadata,
      };
      if (body.firstContactDate !== undefined) { updateData.firstContactDate = body.firstContactDate ? new Date(body.firstContactDate) : null; }

      const updated = await prisma.contact.update({
        where: { id }, data: updateData,
        include: {
          assignedUser: { select: { id: true, fullName: true, email: true } },
          appointments: { orderBy: { appointmentDate: 'desc' }, take: 10 },
          _count: { select: { conversations: true } },
        },
      });

      return updated;
    } catch (err) {
      logger.error('[contacts] Update error:', err);
      return reply.status(500).send({ error: 'Failed to update contact' });
    }
  });

  app.put('/api/v1/contacts/:id/tags', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const { tags } = request.body as { tags: string[] };
      if (!Array.isArray(tags)) return reply.status(400).send({ error: 'tags must be an array' });
      const scopeWhere = await getContactScopeWhereClause(user);
      const existing = await prisma.contact.findFirst({ where: { id, orgId: user.orgId, ...scopeWhere }, select: { id: true } });
      if (!existing) return reply.status(404).send({ error: 'Contact not found or access denied' });
      const updated = await prisma.contact.update({ where: { id }, data: { tags } });
      return updated;
    } catch (err) {
      logger.error('[contacts] Update tags error:', err);
      return reply.status(500).send({ error: 'Failed to update tags' });
    }
  });

  app.delete('/api/v1/contacts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const scopeWhere = await getContactScopeWhereClause(user);
      const existing = await prisma.contact.findFirst({ where: { id, orgId: user.orgId, ...scopeWhere }, select: { id: true } });
      if (!existing) return reply.status(404).send({ error: 'Contact not found or access denied' });
      await prisma.contact.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      logger.error('[contacts] Delete error:', err);
      return reply.status(500).send({ error: 'Failed to delete contact' });
    }
  });
}
