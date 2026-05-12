import { ref, computed } from 'vue';
import { api } from '@/api/index';
import { io, Socket } from 'socket.io-client';
import type { Contact } from '@/composables/use-contacts';

interface ZaloAccount {
  id: string;
  displayName: string | null;
}

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

  const selectedConv = computed(() =>
    conversations.value.find(c => c.id === selectedConvId.value) || null,
  );

  async function fetchConversations() {
    loadingConvs.value = true;
    try {
      const res = await api.get('/conversations', {
        params: { limit: 100, search: searchQuery.value, accountId: accountFilter.value || undefined },
      });
      conversations.value = res.data.conversations;
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      loadingConvs.value = false;
    }
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
      }
    } catch {
      // Non-critical — panel will show partial data from list
    }
    // Mark as read
    try {
      await api.post(`/conversations/${convId}/mark-read`);
      const conv = conversations.value.find(c => c.id === convId);
      if (conv) conv.unreadCount = 0;
    } catch {
      // Ignore mark-read errors
    }
  }

  async function fetchMessages(convId: string) {
    loadingMsgs.value = true;
    try {
      const res = await api.get(`/conversations/${convId}/messages`, {
        params: { limit: 100 },
      });
      messages.value = res.data.messages;
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      loadingMsgs.value = false;
    }
  }

  async function sendMessage(content: string) {
    if (!selectedConvId.value || !content.trim()) return;
    sendingMsg.value = true;
    try {
      const res = await api.post(`/conversations/${selectedConvId.value}/messages`, { content });
      // FIX: Don't push here — the socket 'chat:message' event will deliver it.
      // Pushing here AND from socket caused duplicates in the message list.
      // The socket event fires immediately after the REST response because the
      // server emits io.emit('chat:message') inside the same send handler.
      //
      // However if socket is not connected, push directly as fallback:
      if (!socket?.connected) {
        messages.value.push(res.data);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      sendingMsg.value = false;
    }
  }

  function initSocket() {
    socket = io({ transports: ['websocket', 'polling'] });

    socket.on('chat:message', (data: { message: Message; conversationId: string; accountId: string }) => {
      // FIX: Add to messages if currently viewing this conversation (dedup by id)
      if (data.conversationId === selectedConvId.value) {
        if (!messages.value.find(m => m.id === data.message.id)) {
          messages.value.push(data.message);
        }
      }

      /**
       * FIX: Update conversation list in-place instead of re-fetching.
       *
       * Previous: fetchConversations() on every message → full list reload →
       *   - N*API calls on busy chats
       *   - Conversation list flickers / loses scroll position
       *   - Self-sent messages from Zalo app caused a reload but the conversation
       *     was not found in list (contactId was null) so it appeared to not update
       *
       * New: find the conversation in local state and update its preview fields.
       * If not found (new conversation), do a targeted fetch for just that conversation
       * and prepend it to the list.
       */
      const existingConv = conversations.value.find(c => c.id === data.conversationId);
      if (existingConv) {
        existingConv.lastMessageAt = data.message.sentAt;
        // Only increment unread if NOT currently viewing this conversation
        // and message is from contact (not self)
        if (data.conversationId !== selectedConvId.value && data.message.senderType !== 'self') {
          existingConv.unreadCount = (existingConv.unreadCount || 0) + 1;
          existingConv.isReplied = false;
        }
        if (data.message.senderType === 'self') {
          existingConv.isReplied = true;
          if (data.conversationId === selectedConvId.value) {
            existingConv.unreadCount = 0;
          }
        }
        // Bubble to top of list
        const idx = conversations.value.indexOf(existingConv);
        if (idx > 0) {
          conversations.value.splice(idx, 1);
          conversations.value.unshift(existingConv);
        }
      } else {
        // New conversation (e.g. first message from a new contact) — fetch it
        api.get(`/conversations/${data.conversationId}`)
          .then(res => {
            if (res.data) {
              conversations.value.unshift(res.data);
            }
          })
          .catch(() => {
            // Fallback: full reload if we can't fetch individual conversation
            fetchConversations();
          });
      }
    });

    socket.on('chat:deleted', (data: { msgId: string }) => {
      const msg = messages.value.find(m => m.zaloMsgId === data.msgId);
      if (msg) {
        msg.isDeleted = true;
      }
    });
  }

  function destroySocket() {
    socket?.disconnect();
    socket = null;
  }

  return {
    conversations,
    selectedConvId,
    selectedConv,
    messages,
    loadingConvs,
    loadingMsgs,
    sendingMsg,
    searchQuery,
    accountFilter,
    fetchConversations,
    selectConversation,
    sendMessage,
    initSocket,
    destroySocket,
  };
}
