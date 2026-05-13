import type { Server } from "socket.io";
export interface HistorySyncResult {
    totalThreads: number;
    totalMessages: number;
    skipped: number;
    errors: number;
}
export declare function syncHistoryForAccount(accountId: string, api: any, orgId: string, io?: Server | null, socketId?: string): Promise<HistorySyncResult>;
//# sourceMappingURL=zalo-history-sync.d.ts.map