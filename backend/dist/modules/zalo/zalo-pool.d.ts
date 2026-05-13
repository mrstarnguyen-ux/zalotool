import { Server } from 'socket.io';
type ZaloAccountStatus = 'connected' | 'disconnected' | 'qr_pending' | 'connecting';
interface ZaloInstance {
    id: string;
    api: any;
    status: ZaloAccountStatus;
    lastActivity: number;
    disconnectTimeout?: NodeJS.Timeout;
}
declare class ZaloAccountPool {
    private instances;
    private io;
    setIO(io: Server): void;
    getInstance(accountId: string): ZaloInstance | undefined;
    getStatus(accountId: string): ZaloAccountStatus;
    loginQR(accountId: string): Promise<void>;
    reconnect(accountId: string, sessionData: any): Promise<void>;
    disconnect(accountId: string): void;
    private onDisconnected;
    getApi(accountId: string): any | null;
    getAllStatuses(): Record<string, ZaloAccountStatus>;
}
export declare const zaloPool: ZaloAccountPool;
export {};
//# sourceMappingURL=zalo-pool.d.ts.map