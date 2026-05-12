<template>
  <div>
    <div class="d-flex align-center mb-4">
      <v-btn color="primary" prepend-icon="mdi-tag-plus" @click="openCreate">Thêm nhãn mới</v-btn>
    </div>

    <v-card>
      <v-data-table :headers="headers" :items="labels" :loading="loading" no-data-text="Chưa có nhãn nào">
        <template #item.name="{ item }">
          <v-chip :color="item.color" size="small" variant="flat" class="font-weight-bold">
            <v-icon start size="small">mdi-tag</v-icon>
            {{ item.name }}
          </v-chip>
        </template>
        <template #item.color="{ item }">
          <div class="d-flex align-center">
            <div :style="{ backgroundColor: item.color, width: '20px', height: '20px', borderRadius: '4px' }" class="mr-2 border"></div>
            {{ item.color }}
          </div>
        </template>
        <template #item.actions="{ item }">
          <v-btn icon size="small" title="Sửa" @click="openEdit(item)"><v-icon>mdi-pencil</v-icon></v-btn>
          <v-btn icon size="small" color="error" title="Xóa" @click="confirmDelete(item)"><v-icon>mdi-delete</v-icon></v-btn>
        </template>
      </v-data-table>
    </v-card>

    <!-- Dialog Thêm/Sửa Nhãn -->
    <v-dialog v-model="showDialog" max-width="400">
      <v-card>
        <v-card-title>{{ isEditing ? 'Sửa nhãn' : 'Thêm nhãn mới' }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="form.name" label="Tên nhãn (VD: Khách VIP) *" variant="outlined" class="mb-2" />
          <div class="text-caption mb-1">Màu sắc nhãn</div>
          <v-color-picker v-model="form.color" hide-inputs show-swatches canvas-height="80" class="mb-2" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showDialog = false">Hủy</v-btn>
          <v-btn color="primary" :loading="saving" @click="handleSave">Lưu</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog Xóa -->
    <v-dialog v-model="showDelete" max-width="400">
      <v-card>
        <v-card-title>Xác nhận xóa</v-card-title>
        <v-card-text>Bạn có chắc muốn xóa nhãn "{{ selectedLabel?.name }}"? Các hội thoại đang gắn nhãn này sẽ bị gỡ bỏ.</v-card-text>
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

const labels = ref<any[]>([]);
const loading = ref(false);
const saving = ref(false);
const showDialog = ref(false);
const showDelete = ref(false);
const isEditing = ref(false);
const selectedLabel = ref<any>(null);

const form = ref({ id: '', name: '', color: '#1976D2' });

const headers = [
  { title: 'Tên nhãn', key: 'name' },
  { title: 'Mã màu', key: 'color' },
  { title: 'Hành động', key: 'actions', sortable: false, align: 'end' as const },
];

async function fetchLabels() {
  loading.value = true;
  try {
    const res = await api.get('/labels');
    labels.value = res.data;
  } catch (err) { console.error(err); }
  finally { loading.value = false; }
}

function openCreate() {
  isEditing.value = false;
  form.value = { id: '', name: '', color: '#1976D2' };
  showDialog.value = true;
}

function openEdit(label: any) {
  isEditing.value = true;
  selectedLabel.value = label;
  form.value = { ...label };
  showDialog.value = true;
}

function confirmDelete(label: any) {
  selectedLabel.value = label;
  showDelete.value = true;
}

async function handleSave() {
  if (!form.value.name.trim()) return;
  saving.value = true;
  try {
    if (isEditing.value) {
      await api.put(`/labels/${form.value.id}`, form.value);
    } else {
      await api.post('/labels', form.value);
    }
    showDialog.value = false;
    fetchLabels();
  } catch (err) { console.error(err); }
  finally { saving.value = false; }
}

async function handleDelete() {
  if (!selectedLabel.value) return;
  saving.value = true;
  try {
    await api.delete(`/labels/${selectedLabel.value.id}`);
    showDelete.value = false;
    fetchLabels();
  } catch (err) { console.error(err); }
  finally { saving.value = false; }
}

onMounted(fetchLabels);
</script>
