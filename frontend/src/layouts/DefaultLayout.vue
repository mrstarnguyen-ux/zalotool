<template>
  <!--
    DefaultLayout — Modern SaaS shell
    Sidebar + Topbar tự viết thuần CSS/scoped.
    Vuetify chỉ dùng cho: theme system + component con bên trong view.
    KHÔNG dùng v-navigation-drawer / v-app-bar để tránh CSS conflict.
  -->
  <v-app>

    <!-- ══ SIDEBAR ══════════════════════════════════════════════ -->
    <aside class="crm-sidebar" :class="{ 'crm-sidebar--collapsed': rail }">

      <!-- Logo -->
      <router-link to="/" class="crm-logo">
        <div class="crm-logo-mark">Z</div>
        <span v-show="!rail" class="crm-logo-text">Zalo<b>CRM</b></span>
      </router-link>

      <!-- Workspace -->
      <div v-show="!rail" class="crm-workspace">
        <div class="crm-workspace-av">{{ orgInitial }}</div>
        <div class="crm-workspace-name">{{ authStore.user?.orgName || 'Workspace' }}</div>
        <span class="crm-workspace-chevron">⌄</span>
      </div>

      <!-- Nav -->
      <nav class="crm-nav">
        <!-- Main group -->
        <div class="crm-nav-group">
          <div v-show="!rail" class="crm-nav-section-label">Tổng quan</div>
          <router-link
            v-for="item in mainMenu" :key="item.path"
            :to="item.path" class="crm-nav-item"
            active-class="crm-nav-item--active"
            exact-active-class="crm-nav-item--active"
            :title="rail ? item.title : undefined"
          >
            <v-icon size="18" class="crm-nav-icon">{{ item.icon }}</v-icon>
            <span v-show="!rail" class="crm-nav-label">{{ item.title }}</span>
            <span v-show="!rail && item.badge" class="crm-nav-badge">{{ item.badge }}</span>
          </router-link>
        </div>

        <div class="crm-divider"></div>

        <!-- Analytics group -->
        <div class="crm-nav-group">
          <div v-show="!rail" class="crm-nav-section-label">Phân tích</div>
          <router-link
            v-for="item in analyticsMenu" :key="item.path"
            :to="item.path" class="crm-nav-item"
            active-class="crm-nav-item--active"
            :title="rail ? item.title : undefined"
          >
            <v-icon size="18" class="crm-nav-icon">{{ item.icon }}</v-icon>
            <span v-show="!rail" class="crm-nav-label">{{ item.title }}</span>
          </router-link>
        </div>

        <div class="crm-divider"></div>

        <!-- Label item separate group -->
        <div class="crm-nav-group">
          <router-link
            v-for="item in labelMenu" :key="item.path"
            :to="item.path" class="crm-nav-item"
            active-class="crm-nav-item--active"
            :title="rail ? item.title : undefined"
          >
            <v-icon size="18" class="crm-nav-icon">{{ item.icon }}</v-icon>
            <span v-show="!rail" class="crm-nav-label">{{ item.title }}</span>
          </router-link>
        </div>

        <div class="crm-divider"></div>

        <!-- Config group -->
        <div class="crm-nav-group">
          <div v-show="!rail" class="crm-nav-section-label">Cấu hình</div>
          <router-link
            v-for="item in configMenu" :key="item.path"
            :to="item.path" class="crm-nav-item"
            active-class="crm-nav-item--active"
            :title="rail ? item.title : undefined"
          >
            <v-icon size="18" class="crm-nav-icon">{{ item.icon }}</v-icon>
            <span v-show="!rail" class="crm-nav-label">{{ item.title }}</span>
          </router-link>
        </div>
      </nav>

      <!-- Footer -->
      <div class="crm-sidebar-footer">
        <div class="crm-user-card">
          <div class="crm-user-av">{{ userInitial }}</div>
          <div v-show="!rail" class="crm-user-info">
            <div class="crm-user-name">{{ authStore.user?.fullName }}</div>
            <div class="crm-user-role">{{ authStore.user?.role }}</div>
          </div>
          <div v-show="!rail" class="crm-footer-btns">
            <button class="crm-icon-btn" @click="toggleTheme" :title="isDark ? 'Sáng' : 'Tối'">
              <v-icon size="15">{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
            </button>
            <button class="crm-icon-btn crm-icon-btn--danger" @click="logout" title="Đăng xuất">
              <v-icon size="15">mdi-logout</v-icon>
            </button>
          </div>
        </div>
        <button class="crm-collapse-btn" @click="toggleRail" :title="rail ? 'Mở rộng' : 'Thu gọn'">
          <v-icon size="16">{{ rail ? 'mdi-chevron-right' : 'mdi-chevron-left' }}</v-icon>
        </button>
      </div>
    </aside>

    <!-- ══ MAIN ══════════════════════════════════════════════════ -->
    <div class="crm-main" :class="{ 'crm-main--collapsed': rail }">

      <!-- Topbar -->
      <header class="crm-topbar">
        <span class="crm-topbar-title">{{ currentPageTitle }}</span>
        <div class="crm-topbar-spacer"></div>
        <GlobalSearch />
        <NotificationBell />
        <button class="crm-icon-btn crm-topbar-extra" @click="toggleTheme">
          <v-icon size="17">{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
        </button>
      </header>

      <!-- Page slot -->
      <main class="crm-page">
        <slot />
      </main>
    </div>

  </v-app>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useTheme } from 'vuetify';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import NotificationBell from '@/components/NotificationBell.vue';
import GlobalSearch from '@/components/GlobalSearch.vue';

const theme     = useTheme();
const authStore = useAuthStore();
const router    = useRouter();
const route     = useRoute();

const rail   = ref(localStorage.getItem('crm-rail') === '1');
const isDark = ref(localStorage.getItem('theme') !== 'light');

onMounted(() => {
  theme.global.name.value = isDark.value ? 'dark' : 'light';
});

function toggleTheme() {
  isDark.value = !isDark.value;
  theme.global.name.value = isDark.value ? 'dark' : 'light';
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light');
}

function toggleRail() {
  rail.value = !rail.value;
  localStorage.setItem('crm-rail', rail.value ? '1' : '0');
}

function logout() {
  authStore.logout();
  router.push('/login');
}

// ── Menus ───────────────────────────────────────────────────────
const mainMenu = [
  { title: 'Dashboard',   icon: 'mdi-view-dashboard-outline',  path: '/',              badge: null },
  { title: 'Chat',        icon: 'mdi-message-text-outline',     path: '/chat',          badge: null },
  { title: 'Contacts',    icon: 'mdi-account-group-outline',    path: '/contacts',      badge: null },
  { title: 'Đơn hàng',    icon: 'mdi-cart-outline',             path: '/orders',        badge: null },
  { title: 'Lịch hẹn',    icon: 'mdi-calendar-clock-outline',  path: '/appointments',  badge: null },
];

const analyticsMenu = [
  { title: 'Báo cáo', icon: 'mdi-chart-line', path: '/reports' },
];

const labelMenu = [
  { title: 'Nhãn hội thoại', icon: 'mdi-tag-outline', path: '/labels' },
];

const configMenu = [
  { title: 'Tài khoản Zalo', icon: 'mdi-cellphone-link', path: '/zalo-accounts' },
  { title: 'Cài đặt',        icon: 'mdi-cog-outline',    path: '/settings'      },
  { title: 'API & Webhook',  icon: 'mdi-api',            path: '/api-settings'  },
];

const allItems = [...mainMenu, ...analyticsMenu, ...labelMenu, ...configMenu];

const currentPageTitle = computed(() => {
  // exact match for root, prefix match for others
  const found = allItems.find((m) =>
    m.path === '/' ? route.path === '/' : route.path.startsWith(m.path)
  );
  return found?.title ?? 'ZaloCRM';
});

const userInitial = computed(() =>
  (authStore.user?.fullName || authStore.user?.email || 'U').charAt(0).toUpperCase()
);

const orgInitial = computed(() =>
  (authStore.user?.orgName || 'O').charAt(0).toUpperCase()
);
</script>

<style scoped>
/* ══ Shell layout — scoped, won't leak into Vuetify components ══ */

/* Sidebar */
.crm-sidebar {
  position: fixed; top: 0; left: 0;
  width: var(--crm-sidebar-w);
  height: 100vh;
  background: var(--crm-sidebar);
  border-right: 1px solid var(--crm-border);
  display: flex; flex-direction: column;
  z-index: 200;
  overflow: hidden;
  transition: width .22s cubic-bezier(.4,0,.2,1);
}
.crm-sidebar--collapsed { width: 60px; }

/* Logo */
.crm-logo {
  display: flex; align-items: center; gap: 10px;
  padding: 0 16px;
  height: var(--crm-topbar-h);
  border-bottom: 1px solid var(--crm-border);
  text-decoration: none; flex-shrink: 0;
  overflow: hidden; white-space: nowrap;
}
.crm-logo-mark {
  width: 28px; height: 28px; flex-shrink: 0;
  background: var(--crm-accent); border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; color: #fff;
}
.crm-logo-text {
  font-size: 14.5px; font-weight: 500; color: var(--crm-text);
}
.crm-logo-text b { color: var(--crm-accent); }

/* Workspace */
.crm-workspace {
  display: flex; align-items: center; gap: 8px;
  margin: 10px 10px 4px; padding: 7px 9px;
  border-radius: var(--crm-radius-md);
  background: var(--crm-surface-2); border: 1px solid var(--crm-border);
  cursor: pointer; overflow: hidden; white-space: nowrap; flex-shrink: 0;
}
.crm-workspace-av {
  width: 20px; height: 20px; border-radius: 5px; flex-shrink: 0;
  background: linear-gradient(135deg, var(--crm-accent), #00BFFF);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; color: #fff;
}
.crm-workspace-name {
  flex: 1; font-size: 12.5px; font-weight: 500; color: var(--crm-text);
  overflow: hidden; text-overflow: ellipsis;
}
.crm-workspace-chevron { color: var(--crm-text-3); font-size: 11px; }

/* Nav */
.crm-nav { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 6px 0; }
.crm-nav-group { padding: 4px 0; }
.crm-nav-section-label {
  font-size: 10px; font-weight: 600; letter-spacing: .07em;
  text-transform: uppercase; color: var(--crm-text-3);
  padding: 7px 16px 3px; white-space: nowrap;
}
.crm-nav-item {
  display: flex; align-items: center; gap: 9px;
  padding: 7px 11px 7px 14px; margin: 1px 8px;
  border-radius: var(--crm-radius-sm);
  text-decoration: none; color: var(--crm-text-2);
  font-size: 13px; font-weight: 450;
  transition: background .1s, color .1s;
  white-space: nowrap; overflow: hidden;
}
.crm-nav-item:hover { background: var(--crm-hover); color: var(--crm-text); }
.crm-nav-item--active {
  background: var(--crm-active) !important;
  color: var(--crm-accent-text) !important;
  font-weight: 500;
}
.crm-nav-icon { flex-shrink: 0; opacity: .7; }
.crm-nav-item--active .crm-nav-icon,
.crm-nav-item:hover .crm-nav-icon { opacity: 1; }
.crm-nav-label { flex: 1; }
.crm-nav-badge {
  background: var(--crm-red); color: #fff;
  font-size: 10px; font-weight: 700;
  padding: 1px 5px; border-radius: 10px; line-height: 1.5; flex-shrink: 0;
}
.crm-divider { height: 1px; background: var(--crm-border); margin: 4px 12px; }

/* Footer */
.crm-sidebar-footer { border-top: 1px solid var(--crm-border); padding: 8px; flex-shrink: 0; }
.crm-user-card {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px; border-radius: var(--crm-radius-md);
  overflow: hidden; white-space: nowrap; transition: background .1s;
}
.crm-user-card:hover { background: var(--crm-hover); }
.crm-user-av {
  width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
  background: linear-gradient(135deg, #667EEA, #764BA2);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: #fff;
}
.crm-user-info { flex: 1; min-width: 0; }
.crm-user-name { font-size: 12.5px; font-weight: 500; color: var(--crm-text); overflow: hidden; text-overflow: ellipsis; }
.crm-user-role { font-size: 11px; color: var(--crm-text-3); text-transform: capitalize; }
.crm-footer-btns { display: flex; gap: 2px; flex-shrink: 0; }
.crm-icon-btn {
  width: 26px; height: 26px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  background: transparent; border: none; cursor: pointer;
  color: var(--crm-text-2); transition: background .1s, color .1s;
}
.crm-icon-btn:hover { background: var(--crm-hover); color: var(--crm-text); }
.crm-icon-btn--danger:hover { background: var(--crm-red-soft); color: var(--crm-red); }
.crm-collapse-btn {
  width: 100%; padding: 5px 0; margin-top: 2px;
  display: flex; align-items: center; justify-content: center;
  background: transparent; border: none; cursor: pointer;
  color: var(--crm-text-3); border-radius: var(--crm-radius-sm);
  transition: background .1s, color .1s;
}
.crm-collapse-btn:hover { background: var(--crm-hover); color: var(--crm-text); }

/* ── Main ── */
.crm-main {
  margin-left: var(--crm-sidebar-w);
  display: flex; flex-direction: column; min-height: 100vh;
  transition: margin-left .22s cubic-bezier(.4,0,.2,1);
}
.crm-main--collapsed { margin-left: 60px; }

/* Topbar */
.crm-topbar {
  position: sticky; top: 0; z-index: 100;
  height: var(--crm-topbar-h);
  display: flex; align-items: center; gap: 10px;
  padding: 0 20px;
  background: var(--crm-sidebar);
  border-bottom: 1px solid var(--crm-border);
  flex-shrink: 0;
}
.crm-topbar-title {
  font-size: 15px; font-weight: 600;
  color: var(--crm-text); letter-spacing: -.2px; white-space: nowrap;
}
.crm-topbar-spacer { flex: 1; }
.crm-topbar-extra { color: var(--crm-text-2); }

/* Page wrapper */
.crm-page {
  flex: 1;
  padding: 24px;
  background: var(--crm-bg);
  min-height: calc(100vh - var(--crm-topbar-h));
}

/* ── Responsive mobile ── */
@media (max-width: 768px) {
  .crm-sidebar { transform: translateX(-100%); width: var(--crm-sidebar-w) !important; }
  .crm-main, .crm-main--collapsed { margin-left: 0; }
  .crm-topbar-extra { display: none; }
}
</style>
