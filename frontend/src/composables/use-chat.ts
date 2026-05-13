import { ref, computed } from 'vue';
import { api } from '@/api/index';
import { io, Socket } from 'socket.io-client';
import type { Contact } from '@/composables/use-contacts';

interface ZaloAccount { id: string; displayName: string | null; }
export interface Label { id: string; name: string; color: string; } // <--- ĐÃ THÊM DÒNG NÀY

interface ConversationMessage {
  content: string | null;
  contentType: string;
  senderType: string;
  sentAt: string;
  isDeleted: boolean;
}

export interface Conversation {
  id: string;
  threadType: 'user' | 'group';
  contact: Contact | null;
  zaloAccount: ZaloAccount | null;
  lastMessageAt: string | null;
  unreadCount: number;
  isReplied: boolean;
  labels: Label[]; // <--- ĐÃ SỬA THÀNH BẮT BUỘC VÀ DÙNG INTERFACE Label
  messages?: ConversationMessage[];
}

export interface Message {
  id: string;
  content: string | null;
  contentType: string;
  senderType: string;
  senderName: string | null;
  sentAt: string;
  isDeleted: boolean;
  zaloMsgId: string | null;
}

export function useChat() {
  const conversations = ref<Conversation[]>([]);
  const selectedConvId = ref<string | null>(null);
  const messages = ref<Message[]>([]);
  const loadingConvs = ref(false);
  const loadingMsgs = ref(false);
  const sendingMsg = ref(false);
  const searchQuery = ref('');
  const accountFilter = ref<string | null>(null);
  let socket: Socket | null = null;

  const selectedConv = computed(() => conversations.value.find(c => c.id === selectedConvId.value) || null);

  async function fetchConversations() {
    loadingConvs.value = true;
    try {
      const res = await api.get('/conversations', {
        params: { limit: 100, search: searchQuery.value, accountId: accountFilter.value || undefined },
      });
      conversations.value = res.data.conversations;
    } catch (err) { console.error('Failed to fetch conversations:', err); } finally { loadingConvs.value = false; }
  }

  async function selectConversation(convId: string) {
    selectedConvId.value = convId;
    await fetchMessages(convId);
    // Fetch full conversation detail to populate contact CRM fields
    try {
      const convDetail = await api.get(`/conversations/${convId}`);
      const conv = conversations.value.find(c => c.id === convId);
      if (conv && convDetail.data.contact) {
        conv.contact = convDetail.data.contact;
        conv.labels = convDetail.data.labels || []; // <--- ĐÃ THÊM DÒNG NÀY
      }
    } catch {
      // Non-critical — panel will show partial data from list
    }
    // Mark as read
    // TẮT TÍNH NĂNG TỰ ĐỘNG ĐÁNH DẤU ĐÃ ĐỌC ĐỂ GIỮ CẢNH BÁO CHO APP ZALO
    // try {
    //   await api.post(`/conversations/${convId}/mark-read`);
    //   const conv = conversations.value.find(c => c.id === convId);
    //   if (conv) conv.unreadCount = 0;
    // } catch {
    //   // Ignore mark-read errors
    // }
  }

  async function fetchMessages(convId: string) {
    loadingMsgs.value = true;
    try {
      const res = await api.get(`/conversations/${convId}/messages`, { params: { limit: 100 } });
      messages.value = res.data.messages;
    } catch (err) { console.error('Failed to fetch messages:', err); } finally { loadingMsgs.value = false; }
  }

  async function sendMessage(content: string) {
    if (!selectedConvId.value || !content.trim()) return;
    sendingMsg.value = true;
    try {
      const res = await api.post(`/conversations/${selectedConvId.value}/messages`, { content });
      if (!socket?.connected) { messages.value.push(res.data); }
    } catch (err) { console.error('Failed to send message:', err); } finally { sendingMsg.value = false; }
  }

  // HÀM MỚI: Cập nhật nhãn cho hội thoại
  async function updateLabels(convId: string, labelIds: string[]) {
    try {
      await api.put(`/conversations/${convId}/labels`, { labelIds });
      const conv = conversations.value.find(c => c.id === convId);
      if (conv) {
        const resLabels = await api.get('/labels');
        conv.labels = resLabels.data.filter((l: any) => labelIds.includes(l.id));
      }
    } catch (err) { console.error('Failed to update labels', err); }
  }

  function initSocket() {
    socket = io({ transports: ['websocket', 'polling'] });
    socket.on('chat:message', (data: { message: Message; conversationId: string; accountId: string }) => {
      if (data.conversationId === selectedConvId.value) {
        if (!messages.value.find(m => m.id === data.message.id)) { messages.value.push(data.message); }
      }
      const existingConv = conversations.value.find(c => c.id === data.conversationId);
      if (existingConv) {
        existingConv.lastMessageAt = data.message.sentAt;
        if (data.conversationId !== selectedConvId.value && data.message.senderType !== 'self') {
          existingConv.unreadCount = (existingConv.unreadCount || 0) + 1;
          existingConv.isReplied = false;
        }
        if (data.message.senderType === 'self') {
          existingConv.isReplied = true;
          if (data.conversationId === selectedConvId.value) existingConv.unreadCount = 0;
        }
        const idx = conversations.value.indexOf(existingConv);
        if (idx > 0) { conversations.value.splice(idx, 1); conversations.value.unshift(existingConv); }
      } else {
        api.get(`/conversations/${data.conversationId}`).then(res => { if (res.data) conversations.value.unshift(res.data); });
      }
    });
    socket.on('chat:deleted', (data: { msgId: string }) => {
      const msg = messages.value.find(m => m.zaloMsgId === data.msgId);
      if (msg) { msg.isDeleted = true; }
    });
  }

  function destroySocket() { socket?.disconnect(); socket = null; }

  return {
    conversations, selectedConvId, selectedConv, messages, loadingConvs, loadingMsgs, sendingMsg, searchQuery, accountFilter,
    fetchConversations, selectConversation, sendMessage, updateLabels, initSocket, destroySocket,
  };
}
