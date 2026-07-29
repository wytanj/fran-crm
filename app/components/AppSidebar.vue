<script setup lang="ts">
import {
  Blocks,
  Braces,
  Building2,
  BarChart3,
  Database,
  FileText,
  FlaskConical,
  GitFork,
  LayoutDashboard,
  LoaderCircle,
  Settings
} from '@lucide/vue'

type NavItem = {
  label: string
  to: string
  icon: typeof LayoutDashboard
}

type NavGroup = {
  label?: string
  items: NavItem[]
}

const home: NavItem = { label: 'Home', to: '/', icon: LayoutDashboard }
const docs: NavItem = { label: 'Docs', to: '/docs', icon: FileText }

const publicGroups: NavGroup[] = [
  { items: [home, docs] }
]

const memberGroups: NavGroup[] = [
  { items: [home] },
  {
    label: 'Data',
    items: [
      { label: 'Analytics', to: '/analytics', icon: BarChart3 },
      { label: 'Simulator', to: '/simulator', icon: FlaskConical }
    ]
  },
  {
    label: 'Developer',
    items: [
      { label: 'Graph', to: '/graph', icon: Database },
      { label: 'Schema', to: '/schema', icon: Braces },
      { label: 'API', to: '/api-console', icon: GitFork },
      docs
    ]
  },
  {
    label: 'Admin',
    items: [
      { label: 'Company', to: '/setup', icon: Building2 },
      { label: 'Settings', to: '/settings', icon: Settings }
    ]
  }
]

const { loading: authLoading, refreshSession, startAuthListener, user } = useCrmAuth()
const navGroups = computed(() => user.value ? memberGroups : publicGroups)

onMounted(async () => {
  startAuthListener()
  await refreshSession()
})
</script>

<template>
  <aside class="sidebar">
    <NuxtLink class="brand" to="/">
      <span class="brand-mark">
        <Blocks :size="18" />
      </span>
      <span>
        <strong>Fran CRM</strong>
        <small>Members and rewards</small>
      </span>
    </NuxtLink>

    <nav class="nav-groups" aria-label="Primary">
      <section v-for="(group, index) in navGroups" :key="group.label || `group-${index}`" class="nav-group">
        <h2 v-if="group.label">{{ group.label }}</h2>
        <NuxtLink
          v-for="item in group.items"
          :key="`${group.label || 'top'}-${item.to}`"
          :to="item.to"
          :title="item.label"
          class="nav-link"
        >
          <component :is="item.icon" :size="17" />
          <span>{{ item.label }}</span>
        </NuxtLink>
      </section>
      <span v-if="authLoading && !user" class="nav-loading" role="status" aria-live="polite" aria-busy="true">
        <LoaderCircle :size="15" aria-hidden="true" />
        <span>Checking session</span>
      </span>
    </nav>

    <div class="sidebar-footer">
      <Database :size="17" />
      <div>
        <strong>Supabase</strong>
        <span>Workspace and loyalty data</span>
      </div>
    </div>
  </aside>
</template>
