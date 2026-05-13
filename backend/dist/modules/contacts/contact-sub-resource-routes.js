import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
export async function contactSubResourceRoutes(app) {
    app.addHook('preHandler', authMiddleware);
    // ── GET /api/v1/contacts/:id/appointments — appointments for contact ───────
    app.get('/api/v1/contacts/:id/appointments', async (request, reply) => {
        try {
            const user = request.user;
            const { id } = request.params;
            const appointments = await prisma.appointment.findMany({
                where: { contactId: id, orgId: user.orgId },
                orderBy: { appointmentDate: 'desc' },
                take: 20,
            });
            return { appointments };
        }
        catch (err) {
            logger.error('[contacts] Appointments by contact error:', err);
            return reply.status(500).send({ error: 'Failed to fetch appointments' });
        }
    });
}
//# sourceMappingURL=contact-sub-resource-routes.js.map