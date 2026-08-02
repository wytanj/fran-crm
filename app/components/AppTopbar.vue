<script setup lang="ts">
import { Building2, GitBranch, KeyRound, LoaderCircle, LogOut, Search, UserRound } from '@lucide/vue'

const route = useRoute()
const runtime = useRuntimeConfig()
const query = ref('')
const { isConfigured, loading: authLoading, refreshSession, signOut, startAuthListener, user } = useCrmAuth()
const { loadWorkspaces, pending: workspacePending, primaryWorkspace, requiresSetup } = useCrmWorkspaceAccess()

const pageTitle = computed(() => {
  const labels: Record<string, string> = {
    '/': 'Home',
    '/customers': 'Customers',
    '/graph': 'Identity graph',
    '/analytics': 'Analytics',
    '/simulator': 'Loyalty simulator',
    '/schema': 'Schema',
    '/api-console': 'API',
    '/docs': 'Docs',
    '/docs/api': 'API docs',
    '/docs/fran-pos': 'Fran POS',
    '/docs/agents': 'Agent protocol',
    '/docs/skills': 'Agent skills',
    '/docs/model': 'Data model',
    '/pricing': 'Billing',
    '/setup': 'Company',
    '/settings': 'Settings',
    '/login': 'Sign in'
  }

  return labels[route.path] || 'Fran CRM'
})

async function runTopbarSearch() {
  const q = query.value.trim()
  if (!q) {
    await navigateTo('/customers')
    return
  }
  await navigateTo({ path: '/customers', query: { q } })
}

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
      <form class="search-box" role="search" @submit.prevent="runTopbarSearch">
        <Search :size="17" />
        <input
          v-model="query"
          type="search"
          placeholder="Search customers…"
          aria-label="Search customers"
        >
      </form>
      <NuxtLink v-if="user" class="icon-button" to="/settings" title="API keys">
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
        :aria-busy="workspacePending"
      >
        <LoaderCircle v-if="workspacePending" class="button-spinner" :size="18" aria-hidden="true" />
        <Building2 v-else :size="18" />
        <span>
          <strong>{{ workspacePending ? 'Loading' : primaryWorkspace?.name || 'Set up company' }}</strong>
          <small>{{ workspacePending ? 'Workspace' : primaryWorkspace?.role || 'owner' }}</small>
        </span>
      </NuxtLink>
      <button v-if="user" class="icon-button" type="button" title="Sign out" @click="handleSignOut">
        <LogOut :size="18" />
      </button>
      <span v-else-if="authLoading" class="user-button" role="status" aria-live="polite" aria-busy="true">
        <LoaderCircle class="button-spinner" :size="18" aria-hidden="true" />
        <span>Checking session</span>
      </span>
      <NuxtLink v-else-if="isConfigured" class="user-button" to="/login">
        <UserRound :size="18" />
        <span>Sign in</span>
      </NuxtLink>
    </div>
  </header>
</template>
