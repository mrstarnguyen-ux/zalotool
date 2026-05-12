<template>
  <div>
    <div class="d-flex align-center mb-4">
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreate">Thêm nhóm quyền</v-btn>
    </div>

    <v-card>
      <v-data-table :headers="headers" :items="roles" :loading="loading" no-data-text="Chưa có nhóm quyền nào">
        <template #item.isSystem="{ item }">
          <v-chip :color="item.isSystem ? 'error' : 'success'" size="small" variant="flat">
            {{ item.isSystem ? 'Mặc định' : 'Tùy chỉnh' }}
          </v-chip>
        </template>
        <template #item.actions="{ item }">
          <v-btn icon size="small" title="Chỉnh sửa" @click="openEdit(item)">
            <v-icon>mdi-pencil</v-icon>
          </v-btn>
          <v-btn v-if="!item.isSystem" icon size="small" color="error" title="Xóa" @click="confirmDelete(item)">
            <v-icon>mdi-delete</v-icon>
          </v-btn>
        </template>
      </v-data-table>
    </v-card>

    <!-- Dialog Thêm/Sửa Nhóm quyền -->
    <v-dialog v-model="showDialog" max-width="800" persistent>
      <v-card>
        <v-card-title>{{ isEditing ? 'Chỉnh sửa nhóm quyền' : 'Thêm nhóm quyền mới' }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="form.name" label="Tên nhóm quyền (VD: Trưởng phòng Sale) *" class="mb-2" :disabled="form.isSystem" />
          <v-text-field v-model="form.description" label="Mô tả" class="mb-4" :disabled="form.isSystem" />
          
          <!-- MỚI: Cấu hình phạm vi dữ liệu -->
          <div class="text-subtitle-1 font-weight-bold mb-2 text-primary">Phạm vi hiển thị dữ liệu</div>
          <v-select
            v-model="form.permissions.dataScope"
            :items="scopeOptions"
            item-title="title"
            item-value="value"
            variant="outlined"
            density="comfortable"
            class="mb-4"
            :disabled="form.isSystem"
            hint="Quyết định xem nhân viên thuộc nhóm này được nhìn thấy dữ liệu của ai."
            persistent-hint
          />
          
          <div class="text-subtitle-1 font-weight-bold mb-2 text-primary">Phân quyền chức năng</div>
          <v-table density="compact" class="border rounded">
            <thead>
              <tr>
                <th class="text-left">Chức năng</th>
                <th class="text-center">Xem</th>
                <th class="text-center">Thêm mới</th>
                <th class="text-center">Sửa</th>
                <th class="text-center">Xóa</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="module in modules" :key="module.key">
                <td class="font-weight-medium">{{ module.name }}</td>
                <td class="text-center"><v-checkbox-btn v-model="form.permissions[module.key].view" :disabled="form.isSystem" inline /></td>
                <td class="text-center"><v-checkbox-btn v-model="form.permissions[module.key].create" :disabled="form.isSystem" inline /></td>
                <td class="text-center"><v-checkbox-btn v-model="form.permissions[module.key].edit" :disabled="form.isSystem" inline /></td>
                <td class="text-center"><v-checkbox-btn v-model="form.permissions[module.key].delete" :disabled="form.isSystem" inline /></td>
              </tr>
            </tbody>
          </v-table>
          <v-alert v-if="dialogError" type="error" density="compact" class="mt-4">{{ dialogError }}</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showDialog = false">Hủy</v-btn>
          <v-btn v-if="!form.isSystem" color="primary" :loading="saving" @click="handleSave">Lưu</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog Xóa -->
    <v-dialog v-model="showDelete" max-width="400">
      <v-card>
        <v-card-title>Xác nhận xóa</v-card-title>
        <v-card-text>Bạn có chắc muốn xóa nhóm quyền "{{ selectedRole?.name }}"?</v-card-text>
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

const roles = ref<any[]>([]);
const loading = ref(false);
const saving = ref(false);
const showDialog = ref(false);
const showDelete = ref(false);
const isEditing = ref(false);
const dialogError = ref('');
const selectedRole = ref<any>(null);

const scopeOptions = [
  { title: 'Chỉ dữ liệu của cá nhân (Self)', value: 'self' },
  { title: 'Dữ liệu của cá nhân & Đội nhóm (Team)', value: 'team' },
  { title: 'Toàn bộ dữ liệu công ty (All)', value: 'all' }
];

const modules =[
  { key: 'chat', name: 'Chat & Tin nhắn' },
  { key: 'contacts', name: 'Khách hàng (Contacts)' },
  { key: 'orders', name: 'Đơn hàng' },
  { key: 'appointments', name: 'Lịch hẹn' },
  { key: 'settings', name: 'Cài đặt hệ thống' }
];

const defaultPermissions = () => {
  const perms: any = { dataScope: 'self' }; // Mặc định là chỉ thấy của mình
  modules.forEach(m => { perms[m.key] = { view: false, create: false, edit: false, delete: false }; });
  return perms;
};

const form = ref({ id: '', name: '', description: '', isSystem: false, permissions: defaultPermissions() });

const headers =[
  { title: 'Tên nhóm quyền', key: 'name', sortable: true },
  { title: 'Mô tả', key: 'description' },
  { title: 'Loại', key: 'isSystem', sortable: true },
  { title: 'Hành động', key: 'actions', sortable: false, align: 'end' as const },
];

async function fetchRoles() {
  loading.value = true;
  try {
    const res = await api.get('/roles');
    roles.value = res.data;
  } catch (err) {
    console.error(err);
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  isEditing.value = false;
  form.value = { id: '', name: '', description: '', isSystem: false, permissions: defaultPermissions() };
  dialogError.value = '';
  showDialog.value = true;
}

function openEdit(role: any) {
  isEditing.value = true;
  selectedRole.value = role;
  const mergedPerms = defaultPermissions();
  if (role.permissions) {
    mergedPerms.dataScope = role.permissions.dataScope || 'self';
    Object.keys(role.permissions).forEach(key => {
      if (mergedPerms[key] && key !== 'dataScope') mergedPerms[key] = { ...mergedPerms[key], ...role.permissions[key] };
    });
  }
  form.value = { id: role.id, name: role.name, description: role.description || '', isSystem: role.isSystem, permissions: mergedPerms };
  dialogError.value = '';
  showDialog.value = true;
}

function confirmDelete(role: any) {
  selectedRole.value = role;
  showDelete.value = true;
}

async function handleSave() {
  if (!form.value.name.trim()) { dialogError.value = 'Vui lòng nhập tên nhóm quyền'; return; }
  saving.value = true;
  dialogError.value = '';
  try {
    if (isEditing.value) {
      await api.put(`/roles/${form.value.id}`, form.value);
    } else {
      await api.post('/roles', form.value);
    }
    showDialog.value = false;
    fetchRoles();
  } catch (err: any) {
    dialogError.value = err.response?.data?.error || 'Lỗi khi lưu nhóm quyền';
  } finally {
    saving.value = false;
  }
}

async function handleDelete() {
  if (!selectedRole.value) return;
  saving.value = true;
  try {
    await api.delete(`/roles/${selectedRole.value.id}`);
    showDelete.value = false;
    fetchRoles();
  } catch (err: any) {
    alert(err.response?.data?.error || 'Lỗi khi xóa nhóm quyền');
  } finally {
    saving.value = false;
  }
}

onMounted(fetchRoles);
</script>
