import { ref } from 'vue';
import { api } from '@/api/index';

export interface OrgUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  roleId?: string | null;
  customRole?: { id: string; name: string } | null;
  isActive: boolean;
  teamId: string | null;
  team?: { id: string; name: string } | null;
  assignedZaloAccountId?: string | null;
  assignedZaloAccount?: { id: string; displayName: string } | null;
  createdAt: string;
}

export function useUsers() {
  const users = ref<OrgUser[]>([]);
  const loading = ref(false);
  const error = ref('');

  async function fetchUsers() {
    loading.value = true;
    error.value = '';
    try {
      const res = await api.get('/users');
      users.value = res.data.users;
    } catch (err: any) { error.value = err.response?.data?.error || 'Failed to fetch users'; } 
    finally { loading.value = false; }
  }

  async function createUser(data: any) {
    try { await api.post('/users', data); await fetchUsers(); return { ok: true }; } 
    catch (err: any) { return { ok: false, error: err.response?.data?.error || 'Failed to create user' }; }
  }

  async function updateUser(id: string, data: Partial<OrgUser>) {
    try { await api.put(`/users/${id}`, data); await fetchUsers(); return { ok: true }; } 
    catch (err: any) { return { ok: false, error: err.response?.data?.error || 'Failed to update user' }; }
  }

  async function resetPassword(id: string, password: string) {
    try { await api.put(`/users/${id}/password`, { password }); return { ok: true }; } 
    catch (err: any) { return { ok: false, error: err.response?.data?.error || 'Failed to reset password' }; }
  }

  async function deleteUser(id: string) {
    try { await api.delete(`/users/${id}`); await fetchUsers(); return { ok: true }; } 
    catch (err: any) { return { ok: false, error: err.response?.data?.error || 'Failed to delete user' }; }
  }

  return { users, loading, error, fetchUsers, createUser, updateUser, resetPassword, deleteUser };
}
