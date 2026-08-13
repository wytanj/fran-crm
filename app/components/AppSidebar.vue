<script setup lang="ts">
import {
  BarChart3,
  Braces,
  Building2,
  Database,
  FileText,
  FlaskConical,
  GitFork,
  LayoutDashboard,
  LoaderCircle,
  Settings,
  Users
} from '@lucide/vue'

defineProps<{
  open?: boolean
}>()

defineEmits<{
  close: []
}>()

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
const simulator: NavItem = { label: 'Simulator', to: '/simulator', icon: FlaskConical }
const customers: NavItem = { label: 'Customers', to: '/customers', icon: Users }

// The simulator is pure policy math with no workspace data, so it sits in the
// signed-out nav alongside the docs.
const publicGroups: NavGroup[] = [
  { items: [home, docs, simulator] }
]

const memberGroups: NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      customers,
      { label: 'Analytics', to: '/analytics', icon: BarChart3 },
      simulator
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
const { primaryWorkspace } = useCrmWorkspaceAccess()
const navGroups = computed(() => user.value ? memberGroups : publicGroups)

const initials = computed(() => {
  const email = user.value?.email || ''
  return (email.charAt(0) || 'F').toUpperCase()
})

onMounted(async () => {
  startAuthListener()
  await refreshSession()
})
</script>

<template>
  <aside class="sidebar" :class="{ 'is-open': open }" aria-label="Primary">
    <div class="brand">
      <NuxtLink to="/" @click="$emit('close')">
        <span class="brand-mark">FR</span>
      </NuxtLink>
      <NuxtLink to="/" @click="$emit('close')">
        <strong>Fran CRM</strong>
        <small>Members and rewards</small>
      </NuxtLink>
      <button class="sidebar-close press" type="button" aria-label="Close menu" @click="$emit('close')">✕</button>
    </div>

    <nav class="nav-groups" aria-label="Primary">
      <section v-for="(group, index) in navGroups" :key="group.label || `group-${index}`" class="nav-group">
        <h2 v-if="group.label">{{ group.label }}</h2>
        <NuxtLink
          v-for="item in group.items"
          :key="`${group.label || 'top'}-${item.to}`"
          :to="item.to"
          :title="item.label"
          class="nav-link press"
          @click="$emit('close')"
        >
          <component :is="item.icon" :size="16" />
          <span>{{ item.label }}</span>
        </NuxtLink>
      </section>
      <span v-if="authLoading && !user" class="nav-loading" role="status" aria-live="polite" aria-busy="true">
        <LoaderCircle :size="15" aria-hidden="true" />
        <span>Checking session</span>
      </span>
    </nav>

    <NuxtLink class="sidebar-footer" :to="user ? '/settings' : '/login'" @click="$emit('close')">
      <span class="sidebar-avatar">{{ initials }}</span>
      <div>
        <strong>{{ user?.email || 'Fran CRM' }}</strong>
        <span>{{ user ? (primaryWorkspace?.name || 'Workspace') : 'Sign in' }}</span>
      </div>
    </NuxtLink>
  </aside>
</template>
