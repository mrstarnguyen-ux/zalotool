import { logger } from '../../shared/utils/logger.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { attachZaloListener } from './zalo-listener-factory.js';
class ZaloAccountPool {
    instances = new Map();
    io = null;
    setIO(io) {
        this.io = io;
    }
    getInstance(accountId) {
        return this.instances.get(accountId);
    }
    getStatus(accountId) {
        return this.instances.get(accountId)?.status || 'disconnected';
    }
    async loginQR(accountId) {
        let instance = this.instances.get(accountId);
        if (instance) {
            logger.warn(`[zalo-pool] Account ${accountId} already in pool, disconnecting old instance.`);
            this.disconnect(accountId);
        }
        instance = {
            id: accountId,
            api: null,
            status: 'qr_pending',
            lastActivity: Date.now(),
        };
        this.instances.set(accountId, instance);
        this.io?.emit(`account:${accountId}:status`, { status: 'qr_pending' });
        try {
            const { ZaloAPI } = await import('zca-js');
            const api = new ZaloAPI();
            instance.api = api;
            api.on('qr', (qrCode) => {
                logger.info(`[zalo-pool:${accountId}] QR code generated`);
                this.io?.to(`account:${accountId}`).emit('zalo:qr', { accountId, qrImage: qrCode }); // <--- ĐÃ SỬA DÒNG NÀY
            });
            api.on('login', async (data) => {
                logger.info(`[zalo-pool:${accountId}] Logged in as ${data.displayName}`);
                instance.status = 'connected';
                instance.lastActivity = Date.now();
                this.io?.emit(`account:${accountId}:status`, { status: 'connected', displayName: data.displayName });
                // Save session data to DB
                await prisma.zaloAccount.update({
                    where: { id: accountId },
                    data: {
                        zaloUid: data.uid,
                        displayName: data.displayName,
                        avatarUrl: data.avatar,
                        phone: data.phoneNumber,
                        sessionData: {
                            cookie: data.cookie,
                            imei: data.imei,
                            userAgent: data.userAgent,
                        },
                        status: 'connected',
                        lastConnectedAt: new Date(),
                    },
                });
                // Attach listener for incoming messages
                attachZaloListener({
                    accountId,
                    api,
                    io: this.io,
                    userInfoCache: new Map(),
                    onDisconnected: (id) => this.onDisconnected(id),
                    ownZaloUid: data.uid,
                });
            });
            api.on('error', (err) => {
                logger.error(`[zalo-pool:${accountId}] API error:`, err);
                this.io?.emit(`account:${accountId}:error`, { error: err.message });
                this.disconnect(accountId);
            });
            api.on('disconnected', (reason) => {
                logger.warn(`[zalo-pool:${accountId}] Disconnected: ${reason}`);
                this.io?.emit(`account:${accountId}:status`, { status: 'disconnected', reason });
                this.onDisconnected(accountId);
            });
            await api.login();
        }
        catch (err) {
            logger.error(`[zalo-pool] Failed to initialize ZaloAPI for ${accountId}:`, err);
            this.io?.emit(`account:${accountId}:error`, { error: 'Failed to initialize ZaloAPI' });
            this.disconnect(accountId);
        }
    }
    async reconnect(accountId, sessionData) {
        let instance = this.instances.get(accountId);
        if (instance) {
            logger.warn(`[zalo-pool] Account ${accountId} already in pool, disconnecting old instance.`);
            this.disconnect(accountId);
        }
        instance = {
            id: accountId,
            api: null,
            status: 'connecting',
            lastActivity: Date.now(),
        };
        this.instances.set(accountId, instance);
        this.io?.emit(`account:${accountId}:status`, { status: 'reconnecting' });
        try {
            const { ZaloAPI } = await import('zca-js');
            const api = new ZaloAPI();
            instance.api = api;
            api.on('login', async (data) => {
                logger.info(`[zalo-pool:${accountId}] Reconnected as ${data.displayName}`);
                instance.status = 'connected';
                instance.lastActivity = Date.now();
                this.io?.emit(`account:${accountId}:status`, { status: 'connected', displayName: data.displayName });
                await prisma.zaloAccount.update({
                    where: { id: accountId },
                    data: {
                        zaloUid: data.uid,
                        displayName: data.displayName,
                        avatarUrl: data.avatar,
                        phone: data.phoneNumber,
                        status: 'connected',
                        lastConnectedAt: new Date(),
                    },
                });
                attachZaloListener({
                    accountId,
                    api,
                    io: this.io,
                    userInfoCache: new Map(),
                    onDisconnected: (id) => this.onDisconnected(id),
                    ownZaloUid: data.uid,
                });
            });
            api.on('error', (err) => {
                logger.error(`[zalo-pool:${accountId}] API error during reconnect:`, err);
                this.io?.emit(`account:${accountId}:error`, { error: err.message });
                this.disconnect(accountId);
            });
            api.on('disconnected', (reason) => {
                logger.warn(`[zalo-pool:${accountId}] Disconnected during reconnect: ${reason}`);
                this.io?.emit(`account:${accountId}:status`, { status: 'disconnected', reason });
                this.onDisconnected(accountId);
            });
            await api.login(sessionData);
        }
        catch (err) {
            logger.error(`[zalo-pool] Failed to reconnect ZaloAPI for ${accountId}:`, err);
            this.io?.emit(`account:${accountId}:error`, { error: 'Failed to reconnect ZaloAPI' });
            this.disconnect(accountId);
        }
    }
    disconnect(accountId) {
        const instance = this.instances.get(accountId);
        if (instance) {
            instance.api?.listener?.stop(); // <--- ĐÃ SỬA DÒNG NÀY
            clearTimeout(instance.disconnectTimeout);
            this.instances.delete(accountId);
            logger.info(`[zalo-pool] Account ${accountId} disconnected and removed from pool.`);
            this.io?.emit(`account:${accountId}:status`, { status: 'disconnected' });
        }
    }
    onDisconnected(accountId) {
        const instance = this.instances.get(accountId);
        if (instance) {
            instance.status = 'disconnected';
            // Schedule auto-reconnect after a delay
            instance.disconnectTimeout = setTimeout(() => {
                logger.info(`[zalo-pool:${accountId}] Auto-reconnecting...`);
                prisma.zaloAccount.findUnique({ where: { id: accountId } })
                    .then((rec) => {
                    if (rec?.sessionData) {
                        this.reconnect(accountId, rec.sessionData).catch((err) => {
                            logger.warn(`Auto-reconnect failed for account ${accountId}:`, err);
                        });
                    }
                    else {
                        logger.warn(`[zalo-pool:${accountId}] No session data for auto-reconnect.`);
                    }
                })
                    .catch((err) => {
                    logger.error(`Failed to fetch account ${accountId} for auto-reconnect:`, err);
                });
            }, 10_000); // 10 seconds delay
        }
    }
    // Public methods for external access
    getApi(accountId) {
        const inst = this.instances.get(accountId);
        return inst?.status === 'connected' ? inst.api : null;
    }
    getAllStatuses() {
        const statuses = {};
        for (const [id, inst] of this.instances) {
            statuses[id] = inst.status;
        }
        return statuses;
    }
}
export const zaloPool = new ZaloAccountPool();
//# sourceMappingURL=zalo-pool.js.map