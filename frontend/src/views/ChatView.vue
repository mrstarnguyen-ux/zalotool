<template>
  <v-row no-gutters style="height: calc(100vh - 100px); overflow: hidden; margin: -16px;">
    <v-col cols="12" sm="4" md="3" class="border-right d-flex flex-column bg-white">
      <div class="pa-3">
        <v-select v-model="accountFilter" :items="accounts" item-title="displayName" item-value="id" label="Tất cả Zalo" density="compact" variant="solo-filled" hide-details clearable class="mb-3" @update:model-value="fetchConversations" />
        <v-text-field v-model="searchQuery" prepend-inner-icon="mdi-magnify" placeholder="Tìm kiếm..." density="compact" variant="solo-filled" hide-details @keyup.enter="fetchConversations" />
      </div>
      <v-divider />
      <ConversationList :conversations="conversations" :selected-id="selectedConvId" :loading="loadingConvs" :search="searchQuery" @select="selectConversation" />
    </v-col>

    <v-col class="d-flex flex-column bg-grey-lighten-4">
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

    <v-col v-if="showContactPanel && selectedConv" cols="12" md="3" class="border-left bg-white overflow-y-auto">
      <ChatContactPanel :contact="selectedConv.contact" :contact-id="selectedConv.contact?.id || null" :conversation-id="selectedConv.id" />
    </v-col>
  </v-row>
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
