<template>
  <div>
    <div class="d-flex align-center mb-4">
      <h1 class="text-h4">Tài khoản Zalo</h1>
      <v-spacer />
      <v-btn color="primary" prepend-icon="mdi-plus" @click="showAddDialog = true">Thêm Zalo</v-btn>
    </div>

    <v-card>
      <v-data-table :headers="headers" :items="accounts" :loading="loading" no-data-text="Chưa có tài khoản Zalo nào">
        <template #item.status="{ item }">
          <v-chip :color="statusColor(item.liveStatus || item.status)" size="small" variant="flat">
            {{ statusText(item.liveStatus || item.status) }}
          </v-chip>
        </template>
        <template #item.actions="{ item }">
          <v-btn icon size="small" color="blue-grey" class="mr-1" title="Đổi tên gợi nhớ" @click="openEdit(item)">
            <v-icon>mdi-pencil</v-icon>
          </v-btn>
          <v-btn v-if="authStore.isAdmin" icon size="small" color="cyan" title="Phân quyền truy cập" @click="openAccess(item)">
            <v-icon>mdi-shield-account</v-icon>
          </v-btn>
          <v-btn icon size="small" color="success" @click="syncContacts(item.id)" title="Đồng bộ danh bạ Zalo" :loading="syncing === item.id">
            <v-icon>mdi-account-sync</v-icon>
          </v-btn>
          <v-btn icon size="small" color="orange" @click="openSyncHistory(item.id)" title="Đồng bộ lịch sử tin nhắn" :disabled="item.liveStatus !== 'connected'">
            <v-icon>mdi-message-sync</v-icon>
          </v-btn>
          <v-btn v-if="item.liveStatus !== 'connected'" icon size="small" color="primary" @click="loginAccount(item.id)" title="Đăng nhập QR">
            <v-icon>mdi-qrcode</v-icon>
          </v-btn>
          <v-btn v-if="item.liveStatus === 'disconnected' && item.sessionData" icon size="small" color="info" @click="reconnectAccount(item.id)" title="Kết nối lại">
            <v-icon>mdi-refresh</v-icon>
          </v-btn>
          <v-btn icon size="small" color="error" @click="confirmDelete(item)" title="Xóa">
            <v-icon>mdi-delete</v-icon>
          </v-btn>
        </template>
      </v-data-table>
    </v-card>

    <v-dialog v-model="showAddDialog" max-width="400">
      <v-card>
        <v-card-title>Thêm tài khoản Zalo</v-card-title>
        <v-card-text>
          <v-text-field v-model="newAccountName" label="Tên hiển thị (VD: Zalo Sale Hương)" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showAddDialog = false">Hủy</v-btn>
          <v-btn color="primary" :loading="adding" @click="handleAddAccount">Thêm</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showQRDialog" max-width="400" persistent>
      <v-card class="text-center pa-4">
        <v-card-title>Quét QR để đăng nhập Zalo</v-card-title>
        <v-card-text>
          <div v-if="qrImage" class="mb-4"><img :src="'data:image/png;base64,' + qrImage" alt="QR Code" style="max-width: 280px;" /></div>
          <div v-else-if="qrScanned" class="mb-4"><v-icon icon="mdi-check-circle" size="64" color="success" /><p class="text-h6 mt-2">Đã quét! Xác nhận trên điện thoại...</p><p v-if="scannedName" class="text-body-2">{{ scannedName }}</p></div>
          <div v-else class="mb-4"><v-progress-circular indeterminate color="primary" size="64" /><p class="mt-2">Đang tạo QR code...</p></div>
          <v-alert v-if="qrError" type="error" density="compact" class="mt-2">{{ qrError }}</v-alert>
        </v-card-text>
        <v-card-actions><v-spacer /><v-btn @click="cancelQR">Đóng</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showDeleteDialog" max-width="400">
      <v-card>
        <v-card-title>Xác nhận xóa</v-card-title>
        <v-card-text>Bạn có chắc muốn xóa tài khoản "{{ deleteTarget?.displayName || deleteTarget?.id }}"?</v-card-text>
        <v-card-actions><v-spacer /><v-btn @click="showDeleteDialog = false">Hủy</v-btn><v-btn color="error" :loading="deleting" @click="handleDeleteAccount">Xóa</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <ZaloAccessDialog v-model="showAccessDialog" :account-id="accessTarget?.id ?? ''" :account-name="accessTarget?.displayName ?? accessTarget?.id ?? ''" />

    <v-dialog v-model="showSyncHistoryDialog" max-width="480" persistent>
      <v-card>
        <v-card-title class="d-flex align-center"><v-icon class="mr-2" color="orange">mdi-message-sync</v-icon>Đồng bộ lịch sử tin nhắn</v-card-title>
        <v-card-text>
          <div v-if="!syncHistoryRunning && !syncHistoryDone"><p class="mb-3">Tính năng này sẽ tải toàn bộ lịch sử tin nhắn từ Zalo về CRM.</p><v-alert type="warning" density="compact" class="mb-3">Quá trình có thể mất vài phút tùy số lượng hội thoại. Không tắt trình duyệt khi đang đồng bộ.</v-alert></div>
          <div v-if="syncHistoryRunning"><p class="mb-2 font-weight-medium">{{ syncHistoryMsg }}</p><v-progress-linear :model-value="syncHistoryPct" color="orange" height="12" rounded striped /><p class="text-caption mt-1 text-center">{{ syncHistoryPct }}%</p></div>
          <div v-if="syncHistoryDone" class="text-center"><v-icon size="64" color="success">mdi-check-circle</v-icon><p class="text-h6 mt-2">Hoàn thành!</p><p class="text-body-2">{{ syncHistoryMsg }}</p></div>
        </v-card-text>
        <v-card-actions><v-spacer /><v-btn @click="closeSyncHistory" :disabled="syncHistoryRunning && !syncHistoryDone">Đóng</v-btn><v-btn v-if="!syncHistoryRunning && !syncHistoryDone" color="orange" :loading="syncHistoryRunning" @click="startSyncHistory">Bắt đầu đồng bộ</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showEditDialog" max-width="400">
      <v-card>
        <v-card-title class="text-h6">Đổi tên gợi nhớ nội bộ</v-card-title>
        <v-card-text>
          <p class="text-caption mb-4 text-grey">Tên này chỉ hiển thị trong hệ thống CRM, không thay đổi tên thật trên Zalo.</p>
          <v-text-field v-model="editName" label="Tên gợi nhớ mới" variant="outlined" hide-details @keyup.enter="handleUpdateName" />
        </v-card-text>
        <v-card-actions><v-spacer /><v-btn variant="text" @click="showEditDialog = false">Hủy</v-btn><v-btn color="primary" :loading="updating" @click="handleUpdateName">Lưu</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useZaloAccounts, type ZaloAccount } from '@/composables/use-zalo-accounts';
import { useAuthStore } from '@/stores/auth';
import ZaloAccessDialog from '@/components/settings/ZaloAccessDialog.vue';
import { api } from '@/api/index';
import { io as socketIO, type Socket } from 'socket.io-client';

const { accounts, loading, adding, deleting, showQRDialog, qrImage, qrScanned, scannedName, qrError, statusColor, statusText, fetchAccounts, addAccount, loginAccount, reconnectAccount, deleteAccount, cancelQR, setupSocket } = useZaloAccounts();
const authStore = useAuthStore();

const showAddDialog = ref(false);
const syncing = ref<string | null>(null);
const showDeleteDialog = ref(false);
const showAccessDialog = ref(false);
const newAccountName = ref('');
const deleteTarget = ref<ZaloAccount | null>(null);
const accessTarget = ref<ZaloAccount | null>(null);

const showEditDialog = ref(false);
const editName = ref('');
const editTarget = ref<ZaloAccount | null>(null);
const updating = ref(false);

function openEdit(account: ZaloAccount) {
  editTarget.value = account;
  editName.value = account.displayName || '';
  showEditDialog.value = true;
}

async function handleUpdateName() {
  if (!editTarget.value || !editName.value.trim()) return;
  updating.value = true;
  try {
    await api.patch(`/zalo-accounts/${editTarget.value.id}`, { displayName: editName.value.trim() });
    showEditDialog.value = false;
    fetchAccounts();
  } catch (err: any) {
    alert('Lỗi: ' + (err.response?.data?.error || err.message));
  } finally {
    updating.value = false;
  }
}

const showSyncHistoryDialog = ref(false);
const syncHistoryAccountId = ref<string | null>(null);
const syncHistoryRunning = ref(false);
const syncHistoryDone = ref(false);
const syncHistoryMsg = ref('');
const syncHistoryPct = ref(0);
let historySocket: Socket | null = null;

function openSyncHistory(accountId: string) {
  syncHistoryAccountId.value = accountId;
  syncHistoryRunning.value = false;
  syncHistoryDone.value = false;
  syncHistoryMsg.value = '';
  syncHistoryPct.value = 0;
  showSyncHistoryDialog.value = true;
}

function closeSyncHistory() {
  if (syncHistoryRunning.value) return;
  showSyncHistoryDialog.value = false;
  historySocket?.off('history:progress');
  historySocket?.off('history:done');
}

async function startSyncHistory() {
  if (!syncHistoryAccountId.value) return;
  syncHistoryRunning.value = true;
  syncHistoryDone.value = false;
  syncHistoryMsg.value = 'Đang kết nối...';
  syncHistoryPct.value = 0;
  if (!historySocket) historySocket = socketIO({ transports: ['websocket', 'polling'] });
  historySocket.on('history:progress', (data: { message: string; percent: number }) => { syncHistoryMsg.value = data.message; syncHistoryPct.value = data.percent; });
  historySocket.on('history:done', (data: { result: any }) => {
    syncHistoryRunning.value = false; syncHistoryDone.value = true;
    const r = data.result;
    syncHistoryMsg.value = `${r.totalMessages} tin nhắn mới · ${r.skipped} đã có · ${r.errors} lỗi`;
    syncHistoryPct.value = 100;
  });
  try {
    await api.post(`/zalo-accounts/${syncHistoryAccountId.value}/sync-history`, { socketId: historySocket.id });
  } catch (err: any) {
    syncHistoryRunning.value = false;
    syncHistoryMsg.value = 'Lỗi: ' + (err.response?.data?.error || err.message);
  }
}

onUnmounted(() => { historySocket?.disconnect(); });

const headers =[
  { title: 'Tên', key: 'displayName', sortable: true },
  { title: 'Zalo UID', key: 'zaloUid' },
  { title: 'SĐT', key: 'phone' },
  { title: 'Trạng thái', key: 'status', sortable: true },
  { title: 'Hành động', key: 'actions', sortable: false, align: 'end' as const },
];

async function syncContacts(accountId: string) {
  syncing.value = accountId;
  try {
    const res = await api.post(`/zalo-accounts/${accountId}/sync-contacts`);
    alert(`Đồng bộ thành công: ${res.data.created} mới, ${res.data.updated} cập nhật`);
  } catch (err: any) {
    alert('Đồng bộ thất bại: ' + (err.response?.data?.error || err.message));
  } finally { syncing.value = null; }
}

async function handleAddAccount() {
  const ok = await addAccount(newAccountName.value);
  if (ok) { showAddDialog.value = false; newAccountName.value = ''; }
}

function confirmDelete(account: ZaloAccount) { deleteTarget.value = account; showDeleteDialog.value = true; }
function openAccess(account: ZaloAccount) { accessTarget.value = account; showAccessDialog.value = true; }

async function handleDeleteAccount() {
  if (!deleteTarget.value) return;
  const ok = await deleteAccount(deleteTarget.value);
  if (ok) { showDeleteDialog.value = false; deleteTarget.value = null; }
}

onMounted(() => { fetchAccounts(); setupSocket(); });
</script>
