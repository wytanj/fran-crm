<script setup lang="ts">
import {
  Blocks,
  Bot,
  Braces,
  Building2,
  BarChart3,
  Database,
  FileText,
  GitFork,
  Gift,
  LayoutDashboard,
  PlugZap,
  Settings
} from '@lucide/vue'

const navItems = [
  { label: 'Home', to: '/', icon: LayoutDashboard },
  { label: 'Docs', to: '/docs', icon: FileText }
]

const signedInNavItems = [
  { label: 'Graph', to: '/graph', icon: Database },
  { label: 'Analytics', to: '/analytics', icon: BarChart3 },
  { label: 'Setup', to: '/setup', icon: Building2 },
  { label: 'Schema', to: '/schema', icon: Braces },
  { label: 'API', to: '/api-console', icon: GitFork },
  { label: 'Agents', to: '/agents', icon: Bot },
  { label: 'Workspace', to: '/pricing', icon: Building2 },
  { label: 'Fran', to: '/fran', icon: Gift },
  { label: 'Integrations', to: '/integrations', icon: PlugZap },
  { label: 'Settings', to: '/settings', icon: Settings }
]

const { refreshSession, startAuthListener, user } = useCrmAuth()
const visibleNavItems = computed(() => user.value ? [...navItems, ...signedInNavItems] : navItems)

onMounted(async () => {
  startAuthListener()
  await refreshSession()
})
</script>

<template>
  <aside class="sidebar">
    <NuxtLink class="brand" to="/">
      <span class="brand-mark">
        <Blocks :size="19" />
      </span>
      <span>
        <strong>Fran CRM</strong>
        <small>Member and rewards brain</small>
      </span>
    </NuxtLink>

    <nav class="nav-list" aria-label="Primary">
      <NuxtLink v-for="item in visibleNavItems" :key="item.to" :to="item.to" class="nav-link">
        <component :is="item.icon" :size="18" />
        <span>{{ item.label }}</span>
      </NuxtLink>
    </nav>

    <div class="sidebar-footer">
      <Database :size="18" />
      <div>
        <strong>Supabase project</strong>
        <span>Workspace and loyalty data.</span>
      </div>
    </div>
  </aside>
</template>
