<template>
  <div class="chat-wrapper">
    <v-row no-gutters class="fill-height flex-nowrap">
      
      <!-- Sidebar: Danh sách hội thoại -->
      <v-col cols="auto" class="chat-sidebar border-right d-flex flex-column bg-white">
        <div class="pa-3 flex-shrink-0">
          <v-select v-model="accountFilter" :items="accounts" item-title="displayName" item-value="id" label="Tất cả Zalo" density="compact" variant="solo-filled" hide-details clearable class="mb-3" @update:model-value="fetchConversations" />
          <v-text-field v-model="searchQuery" prepend-inner-icon="mdi-magnify" placeholder="Tìm kiếm..." density="compact" variant="solo-filled" hide-details @keyup.enter="fetchConversations" />
        </div>
        <v-divider class="flex-shrink-0" />
        <!-- Thêm class cuộn vào đây -->
        <ConversationList :conversations="conversations" :selected-id="selectedConvId" :loading="loadingConvs" :search="searchQuery" @select="selectConversation" class="flex-grow-1 overflow-y-auto" />
      </v-col>

      <!-- Main: Khung Chat chính -->
      <v-col class="d-flex flex-column bg-grey-lighten-4" style="min-width: 0;">
        <MessageThread 
          :conversation="selectedConv" 
          :messages="messages" 
          :loading="loadingMsgs" 
          :sending="sendingMsg" 
          :show-contact-panel="showContactPanel"
          @send="sendMessage" 
          @toggle-contact-panel="showContactPanel = !showContactPanel"
          @update-labels="(ids) => selectedConvId && updateLabels(selectedConvId, ids)"
        />
      </v-col>

      <!-- Right: Thông tin khách hàng -->
      <v-col v-if="showContactPanel && selectedConv" cols="auto" class="chat-contact-panel border-left bg-white d-flex flex-column">
        <ChatContactPanel :contact="selectedConv.contact" :contact-id="selectedConv.contact?.id || null" :conversation-id="selectedConv.id" class="flex-grow-1 overflow-y-auto" />
      </v-col>

    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useChat } from '@/composables/use-chat';
import { useZaloAccounts } from '@/composables/use-zalo-accounts';
import ConversationList from '@/components/chat/ConversationList.vue';
import MessageThread from '@/components/chat/MessageThread.vue';
import ChatContactPanel from '@/components/chat/ChatContactPanel.vue';

const { 
  conversations, selectedConvId, selectedConv, messages, loadingConvs, loadingMsgs, sendingMsg, searchQuery, accountFilter,
  fetchConversations, selectConversation, sendMessage, updateLabels, initSocket, destroySocket 
} = useChat();

const { accounts, fetchAccounts } = useZaloAccounts();
const showContactPanel = ref(true);

onMounted(() => { fetchConversations(); fetchAccounts(); initSocket(); });
onUnmounted(() => { destroySocket(); });
</script>

<style scoped>
.chat-wrapper {
  /* Ép khung chat vừa khít màn hình, bù lại padding của layout tổng */
  height: calc(100vh - 60px); 
  margin: -24px; 
  overflow: hidden;
}

/* Cố định chiều rộng 2 cột bên để cột giữa tự co giãn */
.chat-sidebar {
  width: 320px;
  min-width: 320px;
  max-width: 320px;
}

.chat-contact-panel {
  width: 320px;
  min-width: 320px;
  max-width: 320px;
}

/* ÉP HIỆN THANH CUỘN ĐẸP MẮT CHO TẤT CẢ CÁC VÙNG CÓ THỂ CUỘN */
:deep(.overflow-y-auto::-webkit-scrollbar) {
  width: 6px;
}
:deep(.overflow-y-auto::-webkit-scrollbar-track) {
  background: transparent;
}
:deep(.overflow-y-auto::-webkit-scrollbar-thumb) {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 10px;
}
:deep(.overflow-y-auto::-webkit-scrollbar-thumb:hover) {
  background-color: rgba(0, 0, 0, 0.4);
}
</style>
