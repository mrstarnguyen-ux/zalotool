<template>
  <div>
    <div class="d-flex align-center mb-4">
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">Thêm đội nhóm</v-btn>
    </div>
    <v-card>
      <v-data-table :headers="headers" :items="teams" :loading="loading" no-data-text="Chưa có đội nhóm nào">
        <template #item.manager="{ item }">
          <v-chip v-if="item.manager" color="info" size="small" variant="flat">{{ item.manager.fullName }}</v-chip>
          <span v-else class="text-grey text-caption">Chưa có</span>
        </template>
        <template #item.memberCount="{ item }">
          {{ item._count?.users || 0 }}
        </template>
        <template #item.actions="{ item }">
          <v-btn icon size="small" title="Chỉnh sửa" @click="openEdit(item)"><v-icon>mdi-pencil</v-icon></v-btn>
          <v-btn icon size="small" color="error" title="Xóa" @click="confirmDelete(item)"><v-icon>mdi-delete</v-icon></v-btn>
        </template>
      </v-data-table>
    </v-card>

    <v-dialog v-model="showDialog" max-width="400">
      <v-card>
        <v-card-title>{{ isEditing ? 'Sửa đội nhóm' : 'Thêm đội nhóm' }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="form.name" label="Tên đội nhóm *" class="mb-2" />
          <v-select v-model="form.managerId" :items="users" item-title="fullName" item-value="id" label="Người quản lý" clearable placeholder="Chọn người quản lý" />
          <v-alert v-if="dialogError" type="error" density="compact" class="mt-2">{{ dialogError }}</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showDialog = false">Hủy</v-btn>
          <v-btn color="primary" :loading="saving" @click="handleSave">Lưu</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showDelete" max-width="400">
      <v-card>
        <v-card-title>Xác nhận xóa</v-card-title>
        <v-card-text>Bạn có chắc muốn xóa đội nhóm "{{ selectedTeam?.name }}"?</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showDelete = false">Hủy</v-btn>
          <v-btn color="error" :loading="saving" @click="handleDelete">Xóa</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '@/api/index';

const teams = ref<any[]>([]);
const users = ref<any[]>([]);
const loading = ref(false);
const saving = ref(false);
const showDialog = ref(false);
const showDelete = ref(false);
const isEditing = ref(false);
const dialogError = ref('');
const selectedTeam = ref<any>(null);

const form = ref({ id: '', name: '', managerId: null as string | null });

const headers =[
  { title: 'Tên đội nhóm', key: 'name' },
  { title: 'Người quản lý', key: 'manager' },
  { title: 'Số thành viên', key: 'memberCount' },
  { title: 'Hành động', key: 'actions', sortable: false, align: 'end' as const },
];

async function fetchData() {
  loading.value = true;
  try {
    const [resTeams, resUsers] = await Promise.all([api.get('/teams'), api.get('/users')]);
    teams.value = resTeams.data;
    users.value = resUsers.data.users;
  } catch (err) {
    console.error(err);
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  isEditing.value = false;
  form.value = { id: '', name: '', managerId: null };
  dialogError.value = '';
  showDialog.value = true;
}

function openEdit(team: any) {
  isEditing.value = true;
  selectedTeam.value = team;
  form.value = { id: team.id, name: team.name, managerId: team.managerId || null };
  dialogError.value = '';
  showDialog.value = true;
}

function confirmDelete(team: any) {
  selectedTeam.value = team;
  showDelete.value = true;
}

async function handleSave() {
  if (!form.value.name.trim()) { dialogError.value = 'Vui lòng nhập tên đội nhóm'; return; }
  saving.value = true;
  dialogError.value = '';
  try {
    if (isEditing.value) {
      await api.put(`/teams/${form.value.id}`, form.value);
    } else {
      await api.post('/teams', form.value);
    }
    showDialog.value = false;
    fetchData();
  } catch (err: any) {
    dialogError.value = err.response?.data?.error || 'Lỗi khi lưu';
  } finally {
    saving.value = false;
  }
}

async function handleDelete() {
  if (!selectedTeam.value) return;
  saving.value = true;
  try {
    await api.delete(`/teams/${selectedTeam.value.id}`);
    showDelete.value = false;
    fetchData();
  } catch (err: any) {
    alert(err.response?.data?.error || 'Lỗi khi xóa');
  } finally {
    saving.value = false;
  }
}

onMounted(fetchData);
</script>
