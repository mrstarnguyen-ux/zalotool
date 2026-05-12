<template>
  <div
    class="message-thread d-flex flex-column flex-grow-1"
    style="height: 100%"
  >
    <!-- Empty state -->
    <div
      v-if="!conversation"
      class="d-flex align-center justify-center flex-grow-1"
    >
      <div class="text-center text-grey">
        <v-icon icon="mdi-chat-outline" size="96" color="grey-lighten-2" />
        <p class="text-h6 mt-4">Chọn cuộc trò chuyện</p>
      </div>
    </div>

    <template v-else>
      <!-- Header -->
      <div
        class="pa-3 d-flex align-center"
        style="
          border-bottom: 1px solid var(--border-glow, rgba(0, 242, 255, 0.1));
        "
      >
        <v-avatar size="36" color="grey-lighten-2" class="mr-3">
          <v-icon
            v-if="conversation.threadType === 'group'"
            icon="mdi-account-group"
          />
          <v-img
            v-else-if="conversation.contact?.avatarUrl"
            :src="conversation.contact.avatarUrl"
          />
          <v-icon v-else icon="mdi-account" />
        </v-avatar>
        <div class="flex-grow-1">
          <div class="font-weight-medium">
            {{ conversation.contact?.fullName || "Unknown" }}
          </div>
          <div class="text-caption text-grey">
            {{ conversation.zaloAccount?.displayName || "Zalo" }}
          </div>
        </div>
        <v-btn
          :icon="
            showContactPanel
              ? 'mdi-account-details'
              : 'mdi-account-details-outline'
          "
          size="small"
          variant="text"
          :color="showContactPanel ? 'primary' : undefined"
          @click="$emit('toggle-contact-panel')"
        />
      </div>

      <!-- Messages -->
      <div
        ref="messagesContainer"
        class="flex-grow-1 overflow-y-auto pa-3 chat-messages-area"
      >
        <v-progress-linear
          v-if="loading"
          indeterminate
          color="primary"
          class="mb-2"
        />
        <div
          v-for="msg in messages"
          :key="msg.id"
          class="mb-2 d-flex"
          :class="msg.senderType === 'self' ? 'justify-end' : 'justify-start'"
        >
          <div style="max-width: 70%">
            <div
              v-if="
                conversation.threadType === 'group' && msg.senderType !== 'self'
              "
              class="text-caption mb-1"
              style="color: #00f2ff; font-weight: 500"
            >
              {{ msg.senderName || "Unknown" }}
            </div>
            <div
              class="message-bubble pa-2 px-3 rounded-lg"
              :class="
                msg.senderType === 'self' ? 'bg-primary text-white' : 'bg-white'
              "
              style="word-wrap: break-word"
            >
              <!-- Deleted -->
              <div
                v-if="msg.isDeleted"
                class="text-decoration-line-through font-italic"
                style="opacity: 0.6"
              >
                {{ msg.content || "(tin nhắn)"
                }}<span class="text-caption"> (đã thu hồi)</span>
              </div>
              <!-- Image -->
              <div v-else-if="getImageUrl(msg)">
                <img
                  :src="getImageUrl(msg)!"
                  alt="Hình ảnh"
                  class="chat-image"
                  @click="previewImageUrl = getImageUrl(msg)!"
                />
              </div>
              <!-- File/PDF -->
              <div v-else-if="getFileInfo(msg)" class="file-card">
                <v-icon size="20" class="mr-2" color="info"
                  >mdi-file-document-outline</v-icon
                >
                <div class="flex-grow-1">
                  <div class="text-body-2 font-weight-medium">
                    {{ getFileInfo(msg)!.name }}
                  </div>
                  <div class="text-caption" style="opacity: 0.6">
                    {{ getFileInfo(msg)!.size }}
                  </div>
                </div>
                <v-btn
                  v-if="getFileInfo(msg)!.href"
                  icon
                  size="x-small"
                  variant="text"
                  @click="openFile(getFileInfo(msg)!.href)"
                >
                  <v-icon size="16">mdi-download</v-icon>
                </v-btn>
              </div>
              <!-- Sticker/Video/Voice/GIF -->
              <div v-else-if="msg.contentType === 'sticker'">🏷️ Sticker</div>
              <div v-else-if="msg.contentType === 'video'">🎥 Video</div>
              <div v-else-if="msg.contentType === 'voice'">
                🎤 Tin nhắn thoại
              </div>
              <div v-else-if="msg.contentType === 'gif'">GIF</div>
              <!-- FIX: bubble / location / contact_card / call / group_link -->
              <div
                v-else-if="msg.contentType === 'call'"
                class="d-flex align-center gap-2"
              >
                <v-icon
                  size="16"
                  :color="msg.senderType === 'self' ? 'white' : 'primary'"
                  >mdi-phone</v-icon
                >
                <div>
                  <div class="text-body-2 font-weight-medium">
                    Cuộc gọi thoại
                  </div>
                  <div class="text-caption" style="opacity: 0.75">
                    {{ getCallDuration(msg) }}
                  </div>
                </div>
              </div>
              <!-- Link preview: hiển thị card giống Zalo -->
              <div
                v-else-if="msg.contentType === 'link_preview'"
                class="link-preview-card"
                @click="openFile(getLinkPreview(msg).href)"
              >
                <img
                  v-if="getLinkPreview(msg).thumb"
                  :src="getLinkPreview(msg).thumb"
                  class="link-thumb"
                />
                <div class="link-preview-body pa-2">
                  <div class="text-body-2 font-weight-medium link-title">
                    {{ getLinkPreview(msg).title }}
                  </div>
                  <div
                    v-if="getLinkPreview(msg).description"
                    class="text-caption link-desc"
                    style="opacity: 0.75"
                  >
                    {{ getLinkPreview(msg).description }}
                  </div>
                  <div class="text-caption mt-1" style="opacity: 0.55">
                    🔗 {{ getLinkPreview(msg).domain }}
                  </div>
                </div>
              </div>
              <div
                v-else-if="msg.contentType === 'group_link'"
                class="d-flex align-center gap-2"
              >
                <v-icon
                  size="16"
                  :color="msg.senderType === 'self' ? 'white' : 'success'"
                  >mdi-account-group</v-icon
                >
                <div>
                  <div class="text-body-2 font-weight-medium">
                    Link tham gia nhóm
                  </div>
                  <a
                    v-if="getGroupLinkHref(msg)"
                    :href="getGroupLinkHref(msg)"
                    target="_blank"
                    class="text-caption"
                    :style="
                      msg.senderType === 'self'
                        ? 'color:rgba(255,255,255,0.85)'
                        : ''
                    "
                    >{{ getGroupLinkHref(msg) }}</a
                  >
                </div>
              </div>
              <div
                v-else-if="msg.contentType === 'bubble'"
                class="d-flex align-center gap-1"
                style="opacity: 0.7; font-style: italic"
              >
                <v-icon size="14">mdi-card-text-outline</v-icon> Tin nhắn đặc
                biệt
              </div>
              <div
                v-else-if="msg.contentType === 'location'"
                class="d-flex align-center gap-1"
              >
                <v-icon size="16" color="error">mdi-map-marker</v-icon>
                <span>Đã chia sẻ vị trí</span>
              </div>
              <div
                v-else-if="msg.contentType === 'contact_card'"
                class="d-flex align-center gap-1"
              >
                <v-icon size="16" color="primary">mdi-account-card</v-icon>
                <span>Danh thiếp liên hệ</span>
              </div>
              <!-- Reminder/Calendar -->
              <div v-else-if="isReminderMessage(msg)" class="reminder-card">
                <div class="d-flex align-center mb-1">
                  <v-icon size="16" color="warning" class="mr-1"
                    >mdi-calendar-clock</v-icon
                  >
                  <span
                    class="text-caption font-weight-bold"
                    style="color: #ffb74d"
                    >Nhắc hẹn</span
                  >
                </div>
                <div class="text-body-2">{{ getReminderTitle(msg) }}</div>
                <div
                  v-if="getReminderTime(msg)"
                  class="text-caption mt-1"
                  style="opacity: 0.7"
                >
                  <v-icon size="12" class="mr-1">mdi-clock-outline</v-icon
                  >{{ getReminderTime(msg) }}
                </div>
                <v-btn
                  size="x-small"
                  variant="tonal"
                  color="warning"
                  class="mt-2"
                  prepend-icon="mdi-calendar-sync"
                  @click="syncAppointment(msg)"
                >
                  Đồng bộ lịch
                </v-btn>
              </div>
              <!-- Default text -->
              <div v-else>{{ parseDisplayContent(msg.content) }}</div>
              <!-- Timestamp -->
              <div
                class="text-caption mt-1 msg-time"
                :class="
                  msg.senderType === 'self'
                    ? 'msg-time-self'
                    : 'msg-time-contact'
                "
                style="font-size: 0.7rem"
              >
                {{ formatMessageTime(msg.sentAt) }}
              </div>
            </div>
          </div>
        </div>
        <div
          v-if="!loading && messages.length === 0"
          class="text-center pa-8 text-grey"
        >
          Chưa có tin nhắn
        </div>
      </div>

      <!-- Input -->
      <div class="pa-2 d-flex align-end chat-input-area">
        <v-textarea
          v-model="inputText"
          placeholder="Nhập tin nhắn..."
          variant="solo-filled"
          density="compact"
          hide-details
          auto-grow
          rows="1"
          max-rows="3"
          @keydown.enter.exact.prevent="handleSend"
          class="flex-grow-1 mr-2"
        />
        <v-btn
          icon
          color="primary"
          :loading="sending"
          :disabled="!inputText.trim()"
          @click="handleSend"
          ><v-icon>mdi-send</v-icon></v-btn
        >
      </div>
    </template>

    <!-- Image preview dialog -->
    <v-dialog
      v-model="showImagePreview"
      max-width="900"
      content-class="elevation-0"
    >
      <div
        class="text-center"
        @click="showImagePreview = false"
        style="cursor: pointer"
      >
        <img
          :src="previewImageUrl"
          alt="Preview"
          style="
            max-width: 100%;
            max-height: 85vh;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
          "
        />
        <div class="text-caption mt-2" style="color: #aaa">Nhấn để đóng</div>
      </div>
    </v-dialog>

    <!-- Sync snackbar -->
    <v-snackbar
      v-model="syncSnack.show"
      :color="syncSnack.color"
      timeout="3000"
      >{{ syncSnack.text }}</v-snackbar
    >
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed } from "vue";
import type { Conversation, Message } from "@/composables/use-chat";
import { api } from "@/api/index";

const props = defineProps<{
  conversation: Conversation | null;
  messages: Message[];
  loading: boolean;
  sending: boolean;
  showContactPanel?: boolean;
}>();

const emit = defineEmits<{
  send: [content: string];
  "toggle-contact-panel": [];
}>();

const inputText = ref("");
const messagesContainer = ref<HTMLElement | null>(null);
const previewImageUrl = ref("");
const showImagePreview = computed({
  get: () => !!previewImageUrl.value,
  set: (v) => {
    if (!v) previewImageUrl.value = "";
  },
});
const syncSnack = ref({ show: false, text: "", color: "success" });

function handleSend() {
  if (!inputText.value.trim()) return;
  emit("send", inputText.value);
  inputText.value = "";
}
function formatMessageTime(d: string) {
  return new Date(d).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function openFile(url: string) {
  window.open(url, "_blank");
}

/** Parse duration (giây) từ content cuộc gọi → hiển thị "X phút Y giây" */
function getCallDuration(msg: Message): string {
  try {
    const parsed =
      typeof msg.content === "string" ? JSON.parse(msg.content) : msg.content;
    const params =
      typeof parsed?.params === "string"
        ? JSON.parse(parsed.params)
        : parsed?.params;
    const secs: number = params?.duration ?? 0;
    if (secs === 0) return "Không nghe máy";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m} phút ${s} giây` : `${s} giây`;
  } catch {
    return "";
  }
}

/** Lấy href link nhóm từ content */
function getGroupLinkHref(msg: Message): string {
  try {
    const parsed =
      typeof msg.content === "string" ? JSON.parse(msg.content) : msg.content;
    return parsed?.href || "";
  } catch {
    return "";
  }
}

/** Parse link preview data từ content */
function getLinkPreview(msg: Message): {
  title: string;
  description: string;
  thumb: string;
  href: string;
  domain: string;
} {
  try {
    const parsed =
      typeof msg.content === "string" ? JSON.parse(msg.content) : msg.content;
    const href = parsed?.href || parsed?.title || "";
    let domain = "";
    try {
      domain = new URL(href).hostname.replace("www.", "");
    } catch {}
    return {
      title: parsed?.title || href,
      description: parsed?.description || "",
      thumb: parsed?.thumb || "",
      href,
      domain,
    };
  } catch {
    return { title: "", description: "", thumb: "", href: "", domain: "" };
  }
}

/** Extract image URL from JSON content */
function getImageUrl(msg: Message): string | null {
  if (msg.contentType === "image" && msg.content) {
    if (msg.content.startsWith("http")) return msg.content;
    try {
      const p = JSON.parse(msg.content);
      return p.href || p.thumb || p.hdUrl || null;
    } catch {}
  }
  if (msg.content?.startsWith("{")) {
    try {
      const p = JSON.parse(msg.content);
      const href = p.href || p.thumb || "";
      if (href && /\.(jpg|jpeg|png|webp|gif)/i.test(href)) return href;
      if (href && href.includes("zdn.vn") && !p.params?.includes("fileExt"))
        return href;
    } catch {}
  }
  return null;
}

/** Extract file info from JSON content (PDF, docs, etc.) */
function getFileInfo(
  msg: Message,
): { name: string; size: string; href: string } | null {
  if (!msg.content?.startsWith("{")) return null;
  try {
    const p = JSON.parse(msg.content);
    const params =
      typeof p.params === "string" ? JSON.parse(p.params) : p.params;
    if (params?.fileExt || params?.fType === 1) {
      const bytes = parseInt(params.fileSize || "0");
      const size =
        bytes > 1048576
          ? `${(bytes / 1048576).toFixed(1)} MB`
          : `${Math.round(bytes / 1024)} KB`;
      return {
        name: p.title || `file.${params.fileExt || "unknown"}`,
        size,
        href: p.href || "",
      };
    }
  } catch {}
  return null;
}

function parseDisplayContent(content: string | null): string {
  if (!content) return "";
  if (!content.startsWith("{")) return content;
  try {
    const p = JSON.parse(content);
    if (p.title && p.href) return `🔗 ${p.title}`;
    if (p.title) return p.title;
    if (p.href) return `🔗 ${p.description || p.href}`;
    return content;
  } catch {
    return content;
  }
}

function isReminderMessage(msg: Message): boolean {
  if (!msg.content) return false;
  try {
    const p = JSON.parse(msg.content);
    return p.action === "msginfo.actionlist";
  } catch {
    return false;
  }
}

function getReminderTitle(msg: Message): string {
  try {
    return JSON.parse(msg.content!).title || "";
  } catch {
    return msg.content || "";
  }
}

function getReminderTime(msg: Message): string | null {
  try {
    const p = JSON.parse(msg.content!);
    const params =
      typeof p.params === "string" ? JSON.parse(p.params) : p.params;
    for (const h of params?.highLightsV2 || []) {
      if (h.ts > 1e12)
        return new Date(h.ts).toLocaleString("vi-VN", {
          weekday: "long",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
    }
  } catch {}
  return null;
}

/** Sync Zalo reminder to CRM appointments via API */
async function syncAppointment(msg: Message) {
  if (!props.conversation?.contact?.id) {
    syncSnack.value = {
      show: true,
      text: "Không có thông tin khách hàng",
      color: "error",
    };
    return;
  }
  try {
    const p = JSON.parse(msg.content!);
    const params =
      typeof p.params === "string" ? JSON.parse(p.params) : p.params;
    let appointmentDate: string | null = null;
    for (const h of params?.highLightsV2 || []) {
      if (h.ts > 1e12) {
        appointmentDate = new Date(h.ts).toISOString();
        break;
      }
    }
    if (!appointmentDate) {
      syncSnack.value = {
        show: true,
        text: "Không tìm thấy thời gian hẹn",
        color: "warning",
      };
      return;
    }
    await api.post("/appointments", {
      contactId: props.conversation.contact.id,
      appointmentDate,
      appointmentTime: new Date(appointmentDate).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      type: "tai_kham",
      notes: `[Zalo] ${p.title || ""}`,
    });
    syncSnack.value = {
      show: true,
      text: "Đã đồng bộ lịch hẹn thành công!",
      color: "success",
    };
  } catch (err: any) {
    syncSnack.value = {
      show: true,
      text: err.response?.data?.error || "Đồng bộ thất bại",
      color: "error",
    };
  }
}

watch(
  () => props.messages.length,
  async () => {
    await nextTick();
    if (messagesContainer.value)
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  },
);
</script>

<style scoped>
.message-bubble {
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}
.reminder-card {
  padding: 8px 12px;
  border-left: 3px solid #ffb74d;
  border-radius: 8px;
  background: rgba(255, 183, 77, 0.08);
}
.file-card {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(0, 242, 255, 0.05);
  border: 1px solid rgba(0, 242, 255, 0.1);
}
.chat-image {
  max-width: 100%;
  max-height: 300px;
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.2s;
}
.chat-image:hover {
  transform: scale(1.02);
}
.link-preview-card {
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  border: 1px solid rgba(0, 0, 0, 0.1);
  max-width: 280px;
  background: rgba(255, 255, 255, 0.08);
  transition: opacity 0.15s;
}
.link-preview-card:hover {
  opacity: 0.85;
}
.link-thumb {
  width: 100%;
  max-height: 150px;
  object-fit: cover;
  display: block;
}
.link-title {
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.link-desc {
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>
