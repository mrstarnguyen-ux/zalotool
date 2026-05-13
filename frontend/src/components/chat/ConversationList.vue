<template>
  <div class="flex-grow-1 overflow-y-auto">
    <v-list lines="two" class="pa-0">
      <v-list-item
        v-for="conv in conversations"
        :key="conv.id"
        :active="selectedId === conv.id"
        color="primary"
        @click="$emit('select', conv.id)"
        class="border-bottom"
      >
        <template v-slot:prepend>
          <v-avatar size="48" color="grey-lighten-3">
            <v-icon v-if="conv.threadType === 'group'" icon="mdi-account-group" />
            <v-img v-else-if="conv.contact?.avatarUrl" :src="conv.contact.avatarUrl" />
            <v-icon v-else icon="mdi-account" />
          </v-avatar>
        </template>

        <v-list-item-title class="d-flex align-center">
          <span class="font-weight-bold text-truncate">{{ conv.contact?.fullName || 'Unknown' }}</span>
          <v-spacer />
          <span class="text-caption text-grey">{{ formatTime(conv.lastMessageAt) }}</span>
        </v-list-item-title>

        <v-list-item-subtitle>
          <div v-if="conv.labels && conv.labels.length > 0" class="d-flex flex-wrap mb-1">
            <div v-for="label in conv.labels" :key="label.id" 
                 :style="{ backgroundColor: label.color }" 
                 style="width: 12px; height: 4px; border-radius: 2px; margin-right: 2px;"
                 :title="label.name">
            </div>
          </div>
          <div class="d-flex align-center">
            <span v-if="conv.isReplied" class="text-caption text-grey mr-1">Bạn:</span>
            <span class="text-truncate" :class="conv.unreadCount > 0 ? 'text-black font-weight-medium' : 'text-grey'">
              {{ getPreviewText(conv) }}
            </span>
            <v-spacer />
            <v-badge v-if="conv.unreadCount > 0" :content="conv.unreadCount" color="error" inline />
          </div>
        </v-list-item-subtitle>
      </v-list-item>
    </v-list>
    <div v-if="loading" class="text-center pa-4"><v-progress-circular indeterminate color="primary" /></div>
    <div v-if="!loading && conversations.length === 0" class="text-center pa-4 text-grey">Chưa có cuộc hội thoại nào</div>
  </div>
</template>

<script setup lang="ts">
import type { Conversation } from '@/composables/use-chat';

defineProps<{ 
  conversations: Conversation[]; 
  selectedId: string | null; 
  loading: boolean;
  search?: string;
}>();

defineEmits<{ select: [id: string] }>();

function formatTime(d: string | null) {
  if (!d) return '';
  const date = new Date(d);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function getPreviewText(conv: Conversation) {
  const msg = conv.messages?.[0];
  if (!msg) return 'Chưa có tin nhắn';
  if (msg.isDeleted) return '(Tin nhắn đã thu hồi)';
  if (msg.contentType === 'image') return '[Hình ảnh]';
  if (msg.contentType === 'sticker') return '[Sticker]';
  if (msg.contentType === 'file') return '[Tệp tin]';
  
  const content = msg.content || '';
  if (content.startsWith('{')) {
    try { const p = JSON.parse(content); return p.title || p.description || '[Tin nhắn]'; } catch { return content; }
  }
  return content;
}
</script>
<style scoped>
.border-bottom { border-bottom: 1px solid rgba(0,0,0,0.05); }
</style>
