<template>
  <v-navigation-drawer
    v-model="show"
    location="right"
    :width="720"
    temporary
    style="z-index: 1010"
  >
    <div class="d-flex flex-column" style="height: 100vh">
      <!-- ── Header ── -->
      <div class="drawer-header pa-4 d-flex align-center gap-3">
        <v-avatar size="44" color="grey-lighten-2">
          <v-img v-if="contact?.avatarUrl" :src="contact.avatarUrl" />
          <v-icon v-else icon="mdi-account" size="24" />
        </v-avatar>
        <div class="flex-grow-1">
          <div class="text-subtitle-1 font-weight-semibold">
            {{ contact?.fullName || "Khách hàng" }}
          </div>
          <div class="text-caption text-medium-emphasis">
            {{
              contact?.phone || contact?.email || "Chưa có thông tin liên hệ"
            }}
          </div>
        </div>
        <!-- Nút mở Chat trực tiếp -->
        <v-tooltip text="Mở trong Chat" location="bottom">
          <template #activator="{ props: tooltipProps }">
            <v-btn
              v-bind="tooltipProps"
              icon="mdi-chat-processing-outline"
              variant="text"
              size="small"
              color="primary"
              :loading="navigatingToChat"
              @click="openInChat"
            />
          </template>
        </v-tooltip>
        <v-btn icon="mdi-close" variant="text" size="small" @click="close" />
      </div>

      <v-divider />

      <!-- ── Tabs ── -->
      <v-tabs
        v-model="activeTab"
        color="primary"
        density="compact"
        class="flex-shrink-0"
      >
        <v-tab value="info" prepend-icon="mdi-account-details-outline"
          >Thông tin</v-tab
        >
        <v-tab value="chat" prepend-icon="mdi-chat-outline">
          Chat
          <v-badge
            v-if="totalUnread > 0"
            :content="totalUnread"
            color="error"
            inline
            class="ml-1"
          />
        </v-tab>
      </v-tabs>

      <v-divider />

      <!-- ── Tab: Thông tin ── -->
      <div v-if="activeTab === 'info'" class="flex-grow-1 overflow-y-auto pa-4">
        <v-row dense>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.fullName"
              label="Họ và tên"
              density="compact"
              variant="outlined"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.phone"
              label="Số điện thoại"
              density="compact"
              variant="outlined"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.email"
              label="Email"
              type="email"
              density="compact"
              variant="outlined"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-select
              v-model="form.source"
              :items="SOURCE_OPTIONS"
              item-title="text"
              item-value="value"
              label="Nguồn"
              density="compact"
              variant="outlined"
              clearable
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-select
              v-model="form.status"
              :items="STATUS_OPTIONS"
              item-title="text"
              item-value="value"
              label="Trạng thái"
              density="compact"
              variant="outlined"
              clearable
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.nextAppointmentDate"
              label="Ngày tái khám"
              type="date"
              density="compact"
              variant="outlined"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.firstContactDate"
              label="Ngày tiếp nhận"
              type="date"
              density="compact"
              variant="outlined"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-combobox
              v-model="form.tags"
              label="Tags"
              multiple
              chips
              closable-chips
              clearable
              density="compact"
              variant="outlined"
              hide-details
            />
          </v-col>
          <v-col cols="12">
            <v-textarea
              v-model="form.notes"
              label="Ghi chú"
              rows="3"
              auto-grow
              density="compact"
              variant="outlined"
            />
          </v-col>
        </v-row>

        <div class="d-flex gap-2 mt-2">
          <v-btn
            color="error"
            variant="text"
            :loading="deleting"
            @click="onDelete"
          >
            Xoá
          </v-btn>
          <v-spacer />
          <v-btn variant="text" @click="close">Huỷ</v-btn>
          <v-btn color="primary" :loading="saving" @click="onSave">Lưu</v-btn>
        </div>

        <v-alert
          v-if="saveSuccess"
          type="success"
          density="compact"
          class="mt-3"
          closable
          @click:close="saveSuccess = false"
        >
          Đã lưu thành công!
        </v-alert>
      </div>

      <!-- ── Tab: Chat ── -->
      <div
        v-else-if="activeTab === 'chat'"
        class="d-flex flex-column flex-grow-1"
        style="min-height: 0"
      >
        <!-- Loading conversations -->
        <div v-if="loadingConvs" class="pa-6 text-center">
          <v-progress-circular indeterminate color="primary" />
          <div class="text-caption mt-2 text-medium-emphasis">
            Đang tải cuộc trò chuyện...
          </div>
        </div>

        <!-- Chưa có conversation — hiển thị UI bắt đầu chat -->
        <div v-else-if="conversations.length === 0" class="pa-6 text-center">
          <v-icon
            icon="mdi-chat-outline"
            size="64"
            class="mb-3 text-grey-lighten-1"
          />

          <!-- Contact đã có zaloUid: cho phép bắt đầu chat -->
          <!-- zaloUid được check ở backend; frontend luôn hiển thị nút nếu có tài khoản Zalo -->
          <template v-if="true">
            <div class="text-subtitle-1 font-weight-medium mb-1">
              Chưa có cuộc trò chuyện nào
            </div>
            <div class="text-caption text-medium-emphasis mb-4">
              Chọn tài khoản Zalo và bắt đầu nhắn tin với khách hàng này
            </div>

            <!-- Nếu chỉ 1 tài khoản thì không cần chọn -->
            <v-select
              v-if="zaloAccounts.length > 1"
              v-model="startAccountId"
              :items="zaloAccounts"
              item-title="displayName"
              item-value="id"
              label="Tài khoản Zalo gửi tin"
              density="compact"
              variant="outlined"
              class="mb-3 text-left"
              hide-details
            >
              <template #item="{ item, props: itemProps }">
                <v-list-item v-bind="itemProps">
                  <template #prepend>
                    <v-icon
                      :color="
                        (item as any).raw?.liveStatus === 'connected'
                          ? 'success'
                          : 'grey'
                      "
                      size="12"
                      class="mr-1"
                    >
                      mdi-circle
                    </v-icon>
                  </template>
                </v-list-item>
              </template>
            </v-select>

            <!-- Không có tài khoản Zalo nào -->
            <v-alert
              v-if="zaloAccounts.length === 0"
              type="warning"
              density="compact"
              variant="tonal"
              class="mb-3 text-left"
            >
              Chưa có tài khoản Zalo nào được kết nối.<br />
              Vui lòng kết nối trong <strong>Cài đặt → Tài khoản Zalo</strong>.
            </v-alert>

            <v-btn
              v-else
              color="primary"
              prepend-icon="mdi-chat-plus-outline"
              :loading="startingChat"
              :disabled="!startAccountId"
              @click="startNewChat"
            >
              Bắt đầu chat
            </v-btn>

            <v-alert
              v-if="startError"
              type="error"
              density="compact"
              variant="tonal"
              class="mt-3 text-left"
              closable
              @click:close="startError = ''"
            >
              {{ startError }}
            </v-alert>
          </template>
        </div>

        <!-- Có conversation — hiển thị chat -->
        <template v-else>
          <!-- Selector nếu nhiều hơn 1 conversation -->
          <div v-if="conversations.length > 1" class="pa-2 border-b">
            <v-select
              v-model="selectedConvId"
              :items="conversations"
              :item-title="
                (c) =>
                  `${c.zaloAccount?.displayName || 'Zalo'} — ${c.threadType === 'group' ? 'Nhóm' : 'Tin nhắn'}`
              "
              item-value="id"
              label="Chọn cuộc trò chuyện"
              density="compact"
              variant="outlined"
              hide-details
              class="mx-2"
              @update:model-value="loadMessages"
            />
          </div>

          <!-- Message area -->
          <div
            ref="messagesEl"
            class="flex-grow-1 overflow-y-auto pa-3"
            style="min-height: 0"
          >
            <v-progress-linear
              v-if="loadingMsgs"
              indeterminate
              color="primary"
              class="mb-2"
            />

            <div
              v-for="msg in messages"
              :key="msg.id"
              class="mb-2 d-flex"
              :class="
                msg.senderType === 'self' ? 'justify-end' : 'justify-start'
              "
            >
              <!-- Avatar người dùng (phía trái) -->
              <v-avatar
                v-if="msg.senderType !== 'self'"
                size="28"
                color="grey-lighten-2"
                class="mr-1 mt-1 flex-shrink-0"
              >
                <v-img v-if="contact?.avatarUrl" :src="contact.avatarUrl" />
                <v-icon v-else size="16">mdi-account</v-icon>
              </v-avatar>

              <div style="max-width: 75%">
                <!-- Tên người gửi (nếu là contact) -->
                <div
                  v-if="msg.senderType !== 'self'"
                  class="text-caption text-medium-emphasis mb-1 ml-1"
                >
                  {{ contact?.fullName || msg.senderName || "Khách hàng" }}
                </div>

                <div
                  class="pa-2 px-3 rounded-lg"
                  :class="
                    msg.senderType === 'self'
                      ? 'bg-primary text-white'
                      : 'bg-surface-variant'
                  "
                  style="word-wrap: break-word; font-size: 0.875rem"
                >
                  <div
                    v-if="msg.isDeleted"
                    class="font-italic text-medium-emphasis"
                  >
                    (Tin nhắn đã thu hồi)
                  </div>
                  <div v-else>{{ msg.content || `[${msg.contentType}]` }}</div>
                  <div
                    class="text-caption mt-1"
                    style="font-size: 0.68rem; opacity: 0.7"
                    :class="msg.senderType === 'self' ? 'text-right' : ''"
                  >
                    {{ formatTime(msg.sentAt) }}
                  </div>
                </div>
              </div>
            </div>

            <div
              v-if="!loadingMsgs && messages.length === 0"
              class="text-center pa-6 text-medium-emphasis text-caption"
            >
              Chưa có tin nhắn — hãy gửi tin nhắn đầu tiên!
            </div>
          </div>

          <!-- Input box -->
          <div class="pa-3 border-t d-flex align-end gap-2">
            <v-textarea
              v-model="inputText"
              placeholder="Nhập tin nhắn... (Enter để gửi)"
              variant="outlined"
              density="compact"
              hide-details
              auto-grow
              rows="1"
              max-rows="4"
              class="flex-grow-1"
              :disabled="!selectedConvId || sending"
              @keydown.enter.exact.prevent="handleSend"
              @keydown.shift.enter="() => {}"
            />
            <v-btn
              icon
              color="primary"
              :loading="sending"
              :disabled="!inputText.trim() || !selectedConvId"
              @click="handleSend"
            >
              <v-icon>mdi-send</v-icon>
            </v-btn>
          </div>
        </template>
      </div>
    </div>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import { ref, watch, computed, nextTick, onMounted } from "vue";
import { useRouter } from "vue-router";
import { api } from "@/api/index";
import {
  SOURCE_OPTIONS,
  STATUS_OPTIONS,
  useContacts,
} from "@/composables/use-contacts";
import type { Contact } from "@/composables/use-contacts";

// ── Props / emits ────────────────────────────────────────────────────────────
const props = defineProps<{
  modelValue: boolean;
  contact: Contact | null;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  saved: [contact: Contact];
  deleted: [id: string];
}>();

// ── Router ───────────────────────────────────────────────────────────────────
const router = useRouter();
const navigatingToChat = ref(false);

// Mở cuộc trò chuyện trực tiếp ở trang Chat
async function openInChat() {
  if (!props.contact?.id) return;
  navigatingToChat.value = true;
  try {
    // Tìm conversation hiện có của contact này
    const res = await api.get("/conversations", {
      params: { contactId: props.contact.id, limit: 1 },
    });
    const convs = res.data.conversations as { id: string }[];

    if (convs.length > 0) {
      // Có conversation → navigate thẳng vào
      close();
      router.push({ path: "/chat", query: { convId: convs[0].id } });
    } else if (startAccountId.value) {
      // Chưa có → tạo mới rồi navigate
      const startRes = await api.post("/conversations/start", {
        contactId: props.contact.id,
        zaloAccountId: startAccountId.value,
      });
      close();
      router.push({
        path: "/chat",
        query: { convId: startRes.data.conversationId },
      });
    } else {
      // Chưa có conversation và chưa chọn Zalo account → chuyển sang trang Chat để xử lý
      close();
      router.push({ path: "/chat" });
    }
  } catch (err) {
    console.error("openInChat error:", err);
    close();
    router.push({ path: "/chat" });
  } finally {
    navigatingToChat.value = false;
  }
}
const { saving, deleting, updateContact, deleteContact } = useContacts();

const show = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});

const activeTab = ref<"info" | "chat">("info");
const saveSuccess = ref(false);

function close() {
  emit("update:modelValue", false);
}

// ── Info tab — form ──────────────────────────────────────────────────────────
const form = ref({
  fullName: "",
  phone: "",
  email: "",
  source: "",
  status: "",
  nextAppointmentDate: "",
  firstContactDate: "",
  notes: "",
  tags: [] as string[],
});

watch(
  () => props.contact,
  (c) => {
    if (c) {
      form.value = {
        fullName: c.fullName ?? "",
        phone: c.phone ?? "",
        email: c.email ?? "",
        source: c.source ?? "",
        status: c.status ?? "",
        nextAppointmentDate: c.nextAppointment
          ? new Date(c.nextAppointment).toISOString().split("T")[0]
          : "",
        firstContactDate: c.firstContactDate
          ? new Date(c.firstContactDate).toISOString().split("T")[0]
          : "",
        notes: c.notes ?? "",
        tags: c.tags ?? [],
      };
    }
  },
  { immediate: true, deep: true },
);

async function onSave() {
  if (!props.contact?.id) return;
  const result = await updateContact(props.contact.id, {
    fullName: form.value.fullName || null,
    phone: form.value.phone || null,
    email: form.value.email || null,
    source: form.value.source || null,
    status: form.value.status || null,
    nextAppointment: form.value.nextAppointmentDate
      ? new Date(form.value.nextAppointmentDate + "T00:00:00").toISOString()
      : null,
    firstContactDate: form.value.firstContactDate
      ? new Date(form.value.firstContactDate + "T00:00:00").toISOString()
      : null,
    notes: form.value.notes || null,
    tags: form.value.tags,
  });
  if (result) {
    saveSuccess.value = true;
    emit("saved", result);
    setTimeout(() => {
      saveSuccess.value = false;
    }, 2500);
  }
}

async function onDelete() {
  if (!props.contact?.id) return;
  const ok = await deleteContact(props.contact.id);
  if (ok) {
    emit("deleted", props.contact.id);
    close();
  }
}

// ── Chat tab ─────────────────────────────────────────────────────────────────
interface ConvSummary {
  id: string;
  threadType: string;
  unreadCount: number;
  zaloAccount: { id: string; displayName: string | null } | null;
}

interface Msg {
  id: string;
  senderType: string;
  senderName: string | null;
  content: string | null;
  contentType: string;
  sentAt: string;
  isDeleted: boolean;
}

interface ZaloAccountOption {
  id: string;
  displayName: string;
  liveStatus?: string;
}

const conversations = ref<ConvSummary[]>([]);
const selectedConvId = ref<string | null>(null);
const messages = ref<Msg[]>([]);
const loadingConvs = ref(false);
const loadingMsgs = ref(false);
const sending = ref(false);
const inputText = ref("");
const messagesEl = ref<HTMLElement | null>(null);

// ── Zalo accounts (để chọn khi bắt đầu chat mới) ─────────────────────────────
const zaloAccounts = ref<ZaloAccountOption[]>([]);
const startAccountId = ref<string | null>(null);
const startingChat = ref(false);
const startError = ref("");

const totalUnread = computed(() =>
  conversations.value.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
);

// Load Zalo accounts một lần khi mount
onMounted(async () => {
  try {
    const res = await api.get("/zalo-accounts");
    // Chỉ lấy các account đang connected
    zaloAccounts.value = (res.data as ZaloAccountOption[]).map((a) => ({
      id: a.id,
      displayName: a.displayName || `Zalo ${a.id.slice(0, 6)}`,
      liveStatus: a.liveStatus,
    }));
    // Tự động chọn nếu chỉ có 1 account
    if (zaloAccounts.value.length === 1) {
      startAccountId.value = zaloAccounts.value[0].id;
    }
  } catch (err) {
    console.error("Failed to load zalo accounts:", err);
  }
});

// Load conversations khi drawer mở hoặc contact thay đổi
watch(
  [() => props.modelValue, () => props.contact?.id],
  async ([open]) => {
    if (!open || !props.contact?.id) return;
    conversations.value = [];
    selectedConvId.value = null;
    messages.value = [];
    await loadConversations();
  },
  { immediate: false },
);

// Load conversations khi chuyển sang tab chat
watch(activeTab, async (tab) => {
  if (
    tab === "chat" &&
    conversations.value.length === 0 &&
    props.contact?.id &&
    !loadingConvs.value
  ) {
    await loadConversations();
  }
});

// CHANGE: Dùng contactId để tìm chính xác, không dùng search text nữa
async function loadConversations() {
  if (!props.contact?.id) return;
  loadingConvs.value = true;
  try {
    const res = await api.get("/conversations", {
      params: {
        limit: 50,
        contactId: props.contact.id, // filter chính xác theo contact
      },
    });
    conversations.value = res.data.conversations as ConvSummary[];

    if (conversations.value.length > 0 && !selectedConvId.value) {
      selectedConvId.value = conversations.value[0].id;
      await loadMessages();
    }
  } catch (err) {
    console.error("Failed to load contact conversations:", err);
  } finally {
    loadingConvs.value = false;
  }
}

async function loadMessages() {
  if (!selectedConvId.value) return;
  loadingMsgs.value = true;
  try {
    const res = await api.get(
      `/conversations/${selectedConvId.value}/messages`,
      {
        params: { limit: 80 },
      },
    );
    messages.value = res.data.messages;
    await scrollToBottom();
    // Mark as read
    api
      .post(`/conversations/${selectedConvId.value}/mark-read`)
      .catch(() => {});
  } catch (err) {
    console.error("Failed to load messages:", err);
  } finally {
    loadingMsgs.value = false;
  }
}

async function handleSend() {
  const text = inputText.value.trim();
  if (!text || !selectedConvId.value || sending.value) return;
  sending.value = true;
  try {
    const res = await api.post(
      `/conversations/${selectedConvId.value}/messages`,
      {
        content: text,
      },
    );
    inputText.value = "";
    messages.value.push(res.data);
    await scrollToBottom();
  } catch (err: any) {
    console.error("Failed to send message:", err);
  } finally {
    sending.value = false;
  }
}

// CHANGE: Bắt đầu chat mới với contact từ trang Contacts
async function startNewChat() {
  if (!props.contact?.id || !startAccountId.value) return;
  startingChat.value = true;
  startError.value = "";
  try {
    const res = await api.post("/conversations/start", {
      contactId: props.contact.id,
      zaloAccountId: startAccountId.value,
    });
    // Reload conversations để lấy conversation vừa tạo
    await loadConversations();
    // Chọn conversation vừa tạo/tìm được
    if (res.data.conversationId) {
      selectedConvId.value = res.data.conversationId;
      await loadMessages();
    }
  } catch (err: any) {
    startError.value =
      err.response?.data?.error ||
      "Không thể bắt đầu cuộc trò chuyện. Vui lòng thử lại.";
  } finally {
    startingChat.value = false;
  }
}

async function scrollToBottom() {
  await nextTick();
  if (messagesEl.value) {
    messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
  }
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>

<style scoped>
.drawer-header {
  background: rgba(var(--v-theme-surface), 1);
}

.border-b {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.border-t {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>
