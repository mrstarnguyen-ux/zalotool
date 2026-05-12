<template>
  <div class="message-thread d-flex flex-column flex-grow-1" style="height: 100%;">
    <div v-if="!conversation" class="d-flex align-center justify-center flex-grow-1">
      <div class="text-center text-grey">
        <v-icon icon="mdi-chat-outline" size="96" color="grey-lighten-2" />
        <p class="text-h6 mt-4">Chọn cuộc trò chuyện</p>
      </div>
    </div>

    <template v-else>
      <div class="pa-3 d-flex align-center" style="border-bottom: 1px solid rgba(0,242,255,0.1);">
        <v-avatar size="36" color="grey-lighten-3" class="mr-3">
          <v-icon v-if="conversation.threadType === 'group'" icon="mdi-account-group" />
          <v-img v-else-if="conversation.contact?.avatarUrl" :src="conversation.contact.avatarUrl" />
          <v-icon v-else icon="mdi-account" />
        </v-avatar>
        <div class="flex-grow-1">
          <div class="d-flex align-center">
            <div class="font-weight-medium mr-2">{{ conversation.contact?.fullName || 'Unknown' }}</div>
            <v-chip v-for="label in conversation.labels" :key="label.id" :color="label.color" size="x-small" variant="flat" class="mr-1 px-1" style="height: 18px; font-size: 10px;">
              {{ label.name }}
            </v-chip>
          </div>
          <div class="text-caption text-grey">{{ conversation.zaloAccount?.displayName || 'Zalo' }}</div>
        </div>

        <v-menu :close-on-content-click="false">
          <template v-slot:activator="{ props }">
            <v-btn icon size="small" variant="text" v-bind="props"><v-icon color="grey">mdi-tag-outline</v-icon></v-btn>
          </template>
          <v-list density="compact" width="200">
            <v-list-item v-for="label in allLabels" :key="label.id" @click="toggleLabel(label.id)">
              <template v-slot:prepend><v-checkbox-btn :model-value="isLabelSelected(label.id)" :color="label.color" inline /></template>
              <v-list-item-title :style="{ color: label.color }" class="font-weight-bold">{{ label.name }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>

        <v-btn :icon="showContactPanel ? 'mdi-account-details' : 'mdi-account-details-outline'" size="small" variant="text" @click="$emit('toggle-contact-panel')" />
      </div>

      <div ref="messagesContainer" class="flex-grow-1 overflow-y-auto pa-3 chat-messages-area">
        <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-2" />
        <div v-for="msg in messages" :key="msg.id" class="mb-2 d-flex" :class="msg.senderType === 'self' ? 'justify-end' : 'justify-start'">
          <div style="max-width: 70%;">
            <div class="message-bubble pa-2 px-3 rounded-lg" :class="msg.senderType === 'self' ? 'bg-primary text-white' : 'bg-white'" style="word-wrap: break-word;">
              <div v-if="msg.isDeleted" class="text-caption font-weight-bold mb-1 opacity-70">Tin nhắn đã thu hồi</div>
              <div :style="msg.isDeleted ? 'opacity: 0.5' : ''">
                <div v-if="getImageUrl(msg)"><img :src="getImageUrl(msg)!" class="chat-image" @click="previewImageUrl = getImageUrl(msg)!" /></div>
                <div v-else>{{ parseDisplayContent(msg.content) }}</div>
              </div>
              <div class="text-caption mt-1 opacity-60" style="font-size: 0.7rem;">{{ formatMessageTime(msg.sentAt) }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="pa-2 d-flex align-end chat-input-area">
        <v-textarea v-model="inputText" placeholder="Nhập tin nhắn..." variant="solo-filled" density="compact" hide-details auto-grow rows="1" @keydown.enter.exact.prevent="handleSend" class="flex-grow-1 mr-2" />
        <v-btn icon color="primary" :loading="sending" @click="handleSend"><v-icon>mdi-send</v-icon></v-btn>
      </div>
    </template>

    <v-dialog v-model="showImagePreview" max-width="900"><div class="text-center" @click="showImagePreview = false"><img :src="previewImageUrl" style="max-width: 100%; max-height: 85vh;" /></div></v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted } from 'vue';
import type { Conversation, Message } from '@/composables/use-chat';
import { api } from '@/api/index';

const props = defineProps<{ conversation: Conversation | null; messages: Message[]; loading: boolean; sending: boolean; showContactPanel?: boolean; }>();
const emit = defineEmits<{ send: [content: string]; 'toggle-contact-panel': []; 'update-labels': [labelIds: string[]] }>();

const inputText = ref('');
const messagesContainer = ref<HTMLElement | null>(null);
const previewImageUrl = ref('');
const showImagePreview = computed({ get: () => !!previewImageUrl.value, set: (v) => { if (!v) previewImageUrl.value = ''; } });
const allLabels = ref<any[]>([]);

async function fetchAllLabels() { try { const res = await api.get('/labels'); allLabels.value = res.data; } catch {} }
onMounted(fetchAllLabels);

function isLabelSelected(labelId: string) { return props.conversation?.labels?.some(l => l.id === labelId) || false; }
function toggleLabel(labelId: string) {
  if (!props.conversation) return;
  const currentIds = props.conversation.labels?.map(l => l.id) || [];
  const newIds = currentIds.includes(labelId) ? currentIds.filter(id => id !== labelId) : [...currentIds, labelId];
  emit('update-labels', newIds);
}

function handleSend() { if (!inputText.value.trim()) return; emit('send', inputText.value); inputText.value = ''; }
function formatMessageTime(d: string) { return new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }); }

function getImageUrl(msg: Message): string | null {
  if (msg.contentType === 'image' && msg.content) {
    if (msg.content.startsWith('http')) return msg.content;
    try { const p = JSON.parse(msg.content); return p.href || p.thumb || null; } catch {}
  }
  return null;
}

function parseDisplayContent(content: string | null): string {
  if (!content) return '';
  if (!content.startsWith('{')) return content;
  try { const p = JSON.parse(content); return p.title || p.description || '[Tin nhắn]'; } catch { return content; }
}

watch(() => props.messages.length, async () => { await nextTick(); if (messagesContainer.value) messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight; });
</script>

<style scoped>
.message-bubble { box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1); }
.chat-image { max-width: 100%; max-height: 300px; border-radius: 8px; cursor: pointer; }
</style>
