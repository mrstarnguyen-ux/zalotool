<template>
  <div>
    <h1 class="text-h4 mb-4"><v-icon class="mr-2" style="color: #00F2FF;">mdi-cog-outline</v-icon>Cài đặt</h1>
    <v-tabs v-model="tab" class="mb-4">
      <v-tab value="users">Nhân viên</v-tab>
      <v-tab value="roles">Nhóm quyền</v-tab>
      <v-tab value="labels">Nhãn hội thoại</v-tab>
      <v-tab value="teams">Đội nhóm</v-tab>
      <v-tab value="org">Tổ chức</v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <v-window-item value="users">
        <div class="d-flex align-center mb-4"><v-btn v-if="authStore.isAdmin" color="primary" prepend-icon="mdi-plus" @click="openCreate">Thêm nhân viên</v-btn></div>
        <v-alert v-if="error" type="error" variant="tonal" class="mb-4" closable @click:close="error = ''">{{ error }}</v-alert>
        <v-card>
          <v-data-table :headers="headers" :items="users" :loading="loading" no-data-text="Chưa có nhân viên nào">
            <template #item.role="{ item }">
              <v-chip v-if="item.role === 'owner'" color="primary" size="small" variant="flat">Chủ sở hữu</v-chip>
              <v-chip v-else-if="item.customRole" color="info" size="small" variant="flat">{{ item.customRole.name }}</v-chip>
              <v-chip v-else color="default" size="small" variant="flat">Chưa phân quyền</v-chip>
            </template>
            <template #item.team="{ item }">{{ item.team?.name || '---' }}</template>
            <template #item.zalo="{ item }">
              <v-chip v-if="item.assignedZaloAccount" color="success" size="small" variant="outlined">
                <v-icon start size="small">mdi-chat</v-icon>{{ item.assignedZaloAccount.displayName || 'Zalo' }}
              </v-chip>
              <span v-else class="text-grey text-caption">---</span>
            </template>
            <template #item.isActive="{ item }">
              <v-chip :color="item.isActive ? 'success' : 'default'" size="small" variant="flat">{{ item.isActive ? 'Hoạt động' : 'Vô hiệu' }}</v-chip>
            </template>
            <template #item.actions="{ item }">
              <v-btn v-if="authStore.isAdmin" icon size="small" title="Chỉnh sửa" @click="openEdit(item)"><v-icon>mdi-pencil</v-icon></v-btn>
              <v-btn v-if="authStore.isAdmin" icon size="small" title="Đặt lại mật khẩu" @click="openPassword(item)"><v-icon>mdi-lock-reset</v-icon></v-btn>
              <v-btn v-if="authStore.isOwner && item.id !== authStore.user?.id" icon size="small" color="error" title="Vô hiệu hóa" @click="confirmDelete(item)"><v-icon>mdi-delete</v-icon></v-btn>
            </template>
          </v-data-table>
        </v-card>

        <v-dialog v-model="showCreate" max-width="440">
          <v-card>
            <v-card-title>Thêm nhân viên</v-card-title>
            <v-card-text>
              <v-text-field v-model="form.fullName" label="Họ tên *" class="mb-2" />
              <v-text-field v-model="form.email" label="Email *" type="email" class="mb-2" />
              <v-text-field v-model="form.password" label="Mật khẩu *" type="password" class="mb-2" />
              <v-select v-model="form.roleId" :items="roles" item-title="name" item-value="id" label="Nhóm quyền *" placeholder="Chọn nhóm quyền" />
              <v-select v-model="form.teamId" :items="teams" item-title="name" item-value="id" label="Đội nhóm" clearable placeholder="Chọn đội nhóm" />
              <v-select v-model="form.assignedZaloAccountId" :items="zaloAccounts" item-title="displayName" item-value="id" label="Tài khoản Zalo quản lý" clearable placeholder="Chọn tài khoản Zalo" />
              <v-alert v-if="dialogError" type="error" density="compact" class="mt-2">{{ dialogError }}</v-alert>
            </v-card-text>
            <v-card-actions><v-spacer /><v-btn @click="showCreate = false">Hủy</v-btn><v-btn color="primary" :loading="saving" @click="handleCreate">Tạo</v-btn></v-card-actions>
          </v-card>
        </v-dialog>

        <v-dialog v-model="showEdit" max-width="440">
          <v-card>
            <v-card-title>Chỉnh sửa nhân viên</v-card-title>
            <v-card-text>
              <v-text-field v-model="form.fullName" label="Họ tên" class="mb-2" />
              <v-text-field v-model="form.email" label="Email" type="email" class="mb-2" />
              <v-select v-if="authStore.isOwner && selectedUser?.role !== 'owner'" v-model="form.roleId" :items="roles" item-title="name" item-value="id" label="Nhóm quyền" placeholder="Chọn nhóm quyền" />
              <v-select v-model="form.teamId" :items="teams" item-title="name" item-value="id" label="Đội nhóm" clearable placeholder="Chọn đội nhóm" />
              <v-select v-model="form.assignedZaloAccountId" :items="zaloAccounts" item-title="displayName" item-value="id" label="Tài khoản Zalo quản lý" clearable placeholder="Chọn tài khoản Zalo" />
              <v-alert v-if="dialogError" type="error" density="compact" class="mt-2">{{ dialogError }}</v-alert>
            </v-card-text>
            <v-card-actions><v-spacer /><v-btn @click="showEdit = false">Hủy</v-btn><v-btn color="primary" :loading="saving" @click="handleUpdate">Lưu</v-btn></v-card-actions>
          </v-card>
        </v-dialog>

        <v-dialog v-model="showPassword" max-width="400">
          <v-card>
            <v-card-title>Đặt lại mật khẩu</v-card-title>
            <v-card-text><v-text-field v-model="newPassword" label="Mật khẩu mới *" type="password" /><v-alert v-if="dialogError" type="error" density="compact" class="mt-2">{{ dialogError }}</v-alert></v-card-text>
            <v-card-actions><v-spacer /><v-btn @click="showPassword = false">Hủy</v-btn><v-btn color="primary" :loading="saving" @click="handlePassword">Đặt lại</v-btn></v-card-actions>
          </v-card>
        </v-dialog>

        <v-dialog v-model="showDelete" max-width="400">
          <v-card>
            <v-card-title>Xác nhận vô hiệu hóa</v-card-title>
            <v-card-text>Bạn có chắc muốn vô hiệu hóa nhân viên "{{ selectedUser?.fullName }}"?</v-card-text>
            <v-card-actions><v-spacer /><v-btn @click="showDelete = false">Hủy</v-btn><v-btn color="error" :loading="saving" @click="handleDelete">Vô hiệu hóa</v-btn></v-card-actions>
          </v-card>
        </v-dialog>
      </v-window-item>

      <v-window-item value="roles"><RoleManagement /></v-window-item>
      <v-window-item value="labels"><LabelManagement /></v-window-item> <!-- TAB MỚI -->
      <v-window-item value="teams"><TeamManagement /></v-window-item>
      <v-window-item value="org"><OrgSettings /></v-window-item>
    </v-window>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useUsers, type OrgUser } from '@/composables/use-users';
import { useAuthStore } from '@/stores/auth';
import TeamManagement from '@/components/settings/TeamManagement.vue';
import OrgSettings from '@/components/settings/OrgSettings.vue';
import RoleManagement from '@/components/settings/RoleManagement.vue';
import LabelManagement from '@/components/settings/LabelManagement.vue'; // IMPORT MỚI
import { api } from '@/api/index';

const { users, loading, error, fetchUsers, createUser, updateUser, resetPassword, deleteUser } = useUsers();
const authStore = useAuthStore();

const tab = ref('users');
const showCreate = ref(false);
const showEdit = ref(false);
const showPassword = ref(false);
const showDelete = ref(false);
const saving = ref(false);
const dialogError = ref('');
const newPassword = ref('');
const selectedUser = ref<any>(null);

const roles = ref<any[]>([]);
const teams = ref<any[]>([]);
const zaloAccounts = ref<any[]>([]);
const form = ref({ fullName: '', email: '', password: '', roleId: null as string | null, teamId: null as string | null, assignedZaloAccountId: null as string | null });

const headers =[
  { title: 'Họ tên', key: 'fullName', sortable: true },
  { title: 'Email', key: 'email' },
  { title: 'Nhóm quyền', key: 'role', sortable: true },
  { title: 'Đội nhóm', key: 'team', sortable: true },
  { title: 'Tài khoản Zalo', key: 'zalo', sortable: true },
  { title: 'Trạng thái', key: 'isActive', sortable: true },
  { title: 'Hành động', key: 'actions', sortable: false, align: 'end' as const },
];

async function fetchData() {
  try {
    const [resRoles, resTeams, resZalo] = await Promise.all([api.get('/roles'), api.get('/teams'), api.get('/zalo-accounts')]);
    roles.value = resRoles.data;
    teams.value = resTeams.data;
    zaloAccounts.value = resZalo.data;
  } catch (err) { console.error(err); }
}

function openCreate() {
  form.value = { fullName: '', email: '', password: '', roleId: null, teamId: null, assignedZaloAccountId: null };
  dialogError.value = '';
  showCreate.value = true;
}

function openEdit(user: OrgUser) {
  selectedUser.value = user;
  form.value = { fullName: user.fullName, email: user.email, password: '', roleId: user.roleId || null, teamId: user.teamId || null, assignedZaloAccountId: user.assignedZaloAccountId || null };
  dialogError.value = '';
  showEdit.value = true;
}

function openPassword(user: OrgUser) {
  selectedUser.value = user;
  newPassword.value = '';
  dialogError.value = '';
  showPassword.value = true;
}

function confirmDelete(user: OrgUser) {
  selectedUser.value = user;
  showDelete.value = true;
}

async function handleCreate() {
  if (!form.value.roleId) { dialogError.value = 'Vui lòng chọn nhóm quyền'; return; }
  saving.value = true;
  dialogError.value = '';
  const res = await createUser(form.value);
  saving.value = false;
  if (res.ok) { showCreate.value = false; } else { dialogError.value = res.error || ''; }
}

async function handleUpdate() {
  if (!selectedUser.value) return;
  saving.value = true;
  dialogError.value = '';
  const res = await updateUser(selectedUser.value.id, { 
    fullName: form.value.fullName, email: form.value.email, roleId: form.value.roleId, teamId: form.value.teamId, assignedZaloAccountId: form.value.assignedZaloAccountId 
  });
  saving.value = false;
  if (res.ok) { showEdit.value = false; } else { dialogError.value = res.error || ''; }
}

async function handlePassword() {
  if (!selectedUser.value) return;
  saving.value = true;
  dialogError.value = '';
  const res = await resetPassword(selectedUser.value.id, newPassword.value);
  saving.value = false;
  if (res.ok) { showPassword.value = false; } else { dialogError.value = res.error || ''; }
}

async function handleDelete() {
  if (!selectedUser.value) return;
  saving.value = true;
  const res = await deleteUser(selectedUser.value.id);
  saving.value = false;
  if (res.ok) { showDelete.value = false; }
}

onMounted(() => { fetchUsers(); fetchData(); });
</script>
