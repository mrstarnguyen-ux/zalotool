/**
 * chat-routes.ts — REST API for conversations and messages.
 * All routes require JWT auth and are scoped to the user's org.
 *
 * CHANGES (chat-from-contacts feature):
 *  1. GET /conversations — thêm filter `contactId` để tìm chính xác theo contact
 *  2. POST /conversations/start — tạo hoặc lấy conversation với contact từ Contacts page
 */
import { FastifyInstance } from "fastify";
export declare function chatRoutes(app: FastifyInstance): Promise<void>;
//# sourceMappingURL=chat-routes.d.ts.map