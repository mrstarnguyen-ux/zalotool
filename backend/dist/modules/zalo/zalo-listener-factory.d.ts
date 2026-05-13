/**
 * zalo-listener-factory.ts — sets up zca-js listener events for one Zalo account.
 * Handles message routing, user-info caching, group detection, and undo events.
 * Extracted from ZaloAccountPool to keep zalo-pool.ts under 200 lines.
 *
 * FIX (self-message sync):
 *  1. ownZaloUid added to ListenerContext — required to distinguish self-sent messages.
 *  2. For isSelf=true DMs: threadId = contact UID (correct), senderUid = own UID.
 *     We now pass recipientUid to message-handler so it can upsert the contact record.
 *  3. retryOnClose removed from listener.start() — the 'closed' event already calls
 *     onDisconnected → auto-reconnect. Having both caused duplicate reconnects that
 *     triggered the circuit breaker and required QR re-login.
 */
import type { Server } from "socket.io";
export interface UserInfoCacheEntry {
    zaloName: string;
    avatar: string;
    phone?: string;
    cachedAt: number;
}
export interface ListenerContext {
    accountId: string;
    api: any;
    io: Server | null;
    userInfoCache: Map<string, UserInfoCacheEntry>;
    onDisconnected: (accountId: string) => void;
    /** FIX: own UID of this Zalo account — needed to normalize self-message threadId */
    ownZaloUid: string;
}
export declare function attachZaloListener(ctx: ListenerContext): void;
//# sourceMappingURL=zalo-listener-factory.d.ts.map