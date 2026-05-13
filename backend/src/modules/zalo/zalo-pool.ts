import { createRequire } from "module";
import type { Server } from "socket.io";
import { prisma } from "../../shared/database/prisma-client.js";
import { logger } from "../../shared/utils/logger.js";
import { attachZaloListener, type UserInfoCacheEntry } from "./zalo-listener-factory.js";
import { emitWebhook } from "../api/webhook-service.js";

const require = createRequire(import.meta.url);
const { Zalo } = require("zca-js") as { Zalo: new (opts: { logging: boolean; selfListen?: boolean }) => any; };

interface ZaloCredentials { cookie: any; imei: string; userAgent: string; }

interface ZaloInstance {
  zalo: any; api: any; status: "connected" | "disconnected" | "qr_pending" | "connecting";
  displayName?: string; zaloUid?: string; lastActivity: Date; disconnectTimeout?: NodeJS.Timeout;
}

class ZaloAccountPool {
  private instances = new Map<string, ZaloInstance>();
  private io: Server | null = null;
  private userInfoCache = new Map<string, UserInfoCacheEntry>();
  private disconnectHistory = new Map<string, number[]>();

  setIO(io: Server): void { this.io = io; }

  async loginQR(accountId: string): Promise<void> {
    const zalo = new Zalo({ logging: false, selfListen: true });
    this.instances.set(accountId, { zalo, api: null, status: "qr_pending", lastActivity: new Date() });

    try {
      const api = await zalo.loginQR({}, (event: any) => {
        switch (event.type) {
          case 0: this.io?.to(`account:${accountId}`).emit("zalo:qr", { accountId, qrImage: event.data.image }); break;
          case 1: this.io?.to(`account:${accountId}`).emit("zalo:qr-expired", { accountId }); event.actions?.retry(); break;
          case 2: this.io?.to(`account:${accountId}`).emit("zalo:scanned", { accountId, displayName: event.data.display_name, avatar: event.data.avatar }); break;
          case 4: this.saveCredentials(accountId, { cookie: event.data.cookie, imei: event.data.imei, userAgent: event.data.userAgent }); break;
        }
      });

      const instance = this.instances.get(accountId)!;
      instance.api = api; instance.status = "connected"; instance.lastActivity = new Date();
      const ownId = await api.getOwnId(); instance.zaloUid = ownId;

      try {
        const userInfo = await api.getUserInfo(ownId);
        const profiles = userInfo?.changed_profiles || {};
        const profile = profiles[ownId] || profiles[`${ownId}_0`];
        if (profile?.avatar) {
          await prisma.zaloAccount.update({ where: { id: accountId }, data: { avatarUrl: profile.avatar, displayName: profile.zaloName || profile.zalo_name || profile.displayName || instance.displayName } });
        }
      } catch {}

      this.attachListener(accountId, api);
      this.io?.emit("zalo:connected", { accountId, zaloUid: ownId });
      await this.updateAccountDB(accountId, "connected", ownId);
      prisma.zaloAccount.findUnique({ where: { id: accountId }, select: { orgId: true } }).then((rec: any) => rec && emitWebhook(rec.orgId, "zalo.connected", { accountId })).catch(() => {});
    } catch (err) {
      const instance = this.instances.get(accountId);
      if (instance) instance.status = "disconnected";
      this.io?.emit("zalo:error", { accountId, error: String(err) });
      throw err;
    }
  }

  async reconnect(accountId: string, credentials: ZaloCredentials): Promise<void> {
    const zalo = new Zalo({ logging: false, selfListen: true });
    this.instances.set(accountId, { zalo, api: null, status: "connecting", lastActivity: new Date() });

    try {
      const api = await zalo.login({ cookie: credentials.cookie, imei: credentials.imei, userAgent: credentials.userAgent });
      const instance = this.instances.get(accountId)!;
      instance.api = api; instance.status = "connected"; instance.lastActivity = new Date();
      const ownId = await api.getOwnId(); instance.zaloUid = ownId;

      try {
        const userInfo = await api.getUserInfo(ownId);
        const profiles = userInfo?.changed_profiles || {};
        const profile = profiles[ownId] || profiles[`${ownId}_0`];
        if (profile?.avatar) {
          await prisma.zaloAccount.update({ where: { id: accountId }, data: { avatarUrl: profile.avatar, displayName: profile.zaloName || profile.zalo_name || profile.displayName || instance.displayName } });
        }
      } catch {}

      this.attachListener(accountId, api);
      await this.updateAccountDB(accountId, "connected", ownId);
      this.io?.emit("zalo:connected", { accountId, zaloUid: ownId });
      prisma.zaloAccount.findUnique({ where: { id: accountId }, select: { orgId: true } }).then((rec: any) => rec && emitWebhook(rec.orgId, "zalo.connected", { accountId })).catch(() => {});
    } catch (err) {
      const instance = this.instances.get(accountId);
      if (instance) instance.status = "disconnected";
      await this.updateAccountDB(accountId, "qr_pending", null);
      this.io?.emit("zalo:reconnect-failed", { accountId, error: String(err) });
    }
  }

  private attachListener(accountId: string, api: any): void {
    const ownZaloUid = this.instances.get(accountId)?.zaloUid || "";
    attachZaloListener({
      accountId, api, io: this.io, userInfoCache: this.userInfoCache, ownZaloUid,
      onDisconnected: (id) => {
        const inst = this.instances.get(id);
        if (inst) inst.status = "disconnected";
        this.updateAccountDB(id, "disconnected", null);
        prisma.zaloAccount.findUnique({ where: { id }, select: { orgId: true } }).then((rec: any) => rec && emitWebhook(rec.orgId, "zalo.disconnected", { accountId: id })).catch(() => {});

        const now = Date.now(); const key = `dc_${id}`;
        const history = (this.disconnectHistory.get(key) ||[]).filter((t) => now - t < 5 * 60_000);
        history.push(now); this.disconnectHistory.set(key, history);

        if (history.length >= 5) {
          logger.error(`[zalo:${id}] Circuit breaker: 5 disconnects in 5 min. QR re-login required.`);
          this.updateAccountDB(id, "qr_pending", null);
          this.io?.emit("zalo:reconnect-failed", { accountId: id, error: "Session không ổn định, cần đăng nhập QR lại" });
          this.disconnectHistory.delete(key);
          return;
        }
        setTimeout(() => this.autoReconnect(id), 30_000);
      },
    });
  }

  private saveCredentials(accountId: string, credentials: ZaloCredentials): void {
    prisma.zaloAccount.update({ where: { id: accountId }, data: { sessionData: credentials as any } }).catch((err) => logger.error(`[zalo:${accountId}] saveCredentials error:`, err));
  }

  private async updateAccountDB(accountId: string, status: string, zaloUid: string | null): Promise<void> {
    try { await prisma.zaloAccount.update({ where: { id: accountId }, data: { status, ...(zaloUid !== null ? { zaloUid } : {}), ...(status === "connected" ? { lastConnectedAt: new Date() } : {}) } }); } catch (err) { logger.error(`[zalo:${accountId}] updateAccountDB error:`, err); }
  }

  private async autoReconnect(accountId: string): Promise<void> {
    const inst = this.instances.get(accountId);
    if (inst?.status === "connected") return;
    try {
      const account = await prisma.zaloAccount.findUnique({ where: { id: accountId }, select: { sessionData: true } });
      const session = account?.sessionData as ZaloCredentials | null;
      if (session?.imei) {
        logger.info(`[zalo:${accountId}] Auto-reconnecting...`);
        await this.reconnect(accountId, session);
      } else {
        logger.warn(`[zalo:${accountId}] No saved session, cannot auto-reconnect`);
        this.io?.emit("zalo:reconnect-failed", { accountId, error: "No saved session" });
      }
    } catch (err) {
      logger.error(`[zalo:${accountId}] Auto-reconnect failed:`, err);
      setTimeout(() => this.autoReconnect(accountId), 120_000);
    }
  }

  disconnect(accountId: string): void {
    const instance = this.instances.get(accountId);
    if (instance?.api?.listener) { try { instance.api.listener.stop(); } catch (err) { logger.warn(`[zalo:${accountId}] Error stopping listener:`, err); } }
    this.instances.delete(accountId);
  }

  getStatus(accountId: string): string { return this.instances.get(accountId)?.status ?? "disconnected"; }
  getAllStatuses(): Record<string, string> { const statuses: Record<string, string> = {}; for (const [id, inst] of this.instances) statuses[id] = inst.status; return statuses; }
  getApi(accountId: string): any | null { const inst = this.instances.get(accountId); return inst?.status === "connected" ? inst.api : null; }
  getInstance(accountId: string): ZaloInstance | undefined { return this.instances.get(accountId); }
}

export const zaloPool = new ZaloAccountPool();
