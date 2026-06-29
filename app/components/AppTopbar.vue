<script setup lang="ts">
import { Building2, GitBranch, KeyRound, LogOut, Search, UserRound } from '@lucide/vue'

const route = useRoute()
const runtime = useRuntimeConfig()
const query = ref('')
const { isConfigured, refreshSession, signOut, startAuthListener, user } = useCrmAuth()
const { loadWorkspaces, primaryWorkspace, requiresSetup } = useCrmWorkspaceAccess()

const pageTitle = computed(() => {
  const labels: Record<string, string> = {
    '/': 'Fran CRM',
    '/graph': 'Customer Graph',
    '/schema': 'Schema Designer',
    '/api-console': 'API Layer',
    '/fran': 'Fran POS Contracts',
    '/agents': 'Agent Workbench',
    '/docs': 'Documentation',
    '/docs/api': 'API Documentation',
    '/docs/agents': 'Agent Documentation',
    '/docs/skills': 'Agent Skills',
    '/integrations': 'Integrations',
    '/pricing': 'Workspace Mode',
    '/setup': 'Company Setup',
    '/settings': 'Workspace Settings',
    '/login': 'Sign In'
  }

  return labels[route.path] || 'Fran CRM'
})

onMounted(async () => {
  startAuthListener()
  await refreshSession()

  if (user.value) {
    await loadWorkspaces()
  }
})

async function handleSignOut() {
  await signOut()
  await navigateTo('/')
}
</script>

<template>
  <header class="topbar">
    <div>
      <p class="eyebrow">{{ runtime.public.appName }}</p>
      <h1>{{ pageTitle }}</h1>
    </div>

    <div class="topbar-actions">
      <label class="search-box">
        <Search :size="17" />
        <input v-model="query" type="search" placeholder="Search people, orders, tickets" />
      </label>
      <NuxtLink class="icon-button" to="/settings" title="API keys">
        <KeyRound :size="18" />
      </NuxtLink>
      <a class="icon-button" href="https://github.com/wytanj/fran-crm" target="_blank" rel="noreferrer" title="Repository">
        <GitBranch :size="18" />
      </a>
      <NuxtLink
        v-if="user"
        class="workspace-button"
        :to="requiresSetup ? '/setup' : '/settings'"
        :title="requiresSetup ? 'Set up company' : 'Workspace settings'"
      >
        <Building2 :size="18" />
        <span>
          <strong>{{ primaryWorkspace?.name || 'Setup company' }}</strong>
          <small>{{ primaryWorkspace?.role || 'owner' }}</small>
        </span>
      </NuxtLink>
      <button v-if="user" class="icon-button" type="button" title="Sign out" @click="handleSignOut">
        <LogOut :size="18" />
      </button>
      <NuxtLink v-else-if="isConfigured" class="user-button" to="/login">
        <UserRound :size="18" />
        <span>Sign in</span>
      </NuxtLink>
      <NuxtLink v-else class="user-button" to="/graph">
        <UserRound :size="18" />
        <span>Demo mode</span>
      </NuxtLink>
    </div>
  </header>
</template>
