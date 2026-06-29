<script setup lang="ts">
import {
  Blocks,
  Bot,
  Braces,
  Building2,
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
  { label: 'Graph', to: '/graph', icon: Database },
  { label: 'Setup', to: '/setup', icon: Building2 },
  { label: 'Schema', to: '/schema', icon: Braces },
  { label: 'API', to: '/api-console', icon: GitFork },
  { label: 'Fran', to: '/fran', icon: Gift },
  { label: 'Agents', to: '/agents', icon: Bot },
  { label: 'Docs', to: '/docs', icon: FileText },
  { label: 'Integrations', to: '/integrations', icon: PlugZap },
  { label: 'Settings', to: '/settings', icon: Settings }
]
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
      <NuxtLink v-for="item in navItems" :key="item.to" :to="item.to" class="nav-link">
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
