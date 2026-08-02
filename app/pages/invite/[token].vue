<script setup lang="ts">
definePageMeta({
  layout: false,
})

const route = useRoute()
const token = computed(() => String(route.params.token || ''))

const { isConfigured, refreshSession, signInWithGoogle, startAuthListener, user } = useCrmAuth()
const { loadWorkspaces } = useCrmWorkspaceAccess()
const { previewInvite, acceptInvite } = useCrmWorkspaceInvites()

const preview = ref<Awaited<ReturnType<typeof previewInvite>> | null>(null)
const errorMsg = ref('')
const busy = ref(false)
const loading = ref(true)
const status = ref<'loading' | 'ready' | 'done' | 'error'>('loading')

onMounted(async () => {
  startAuthListener()
  await refreshSession()
  try {
    preview.value = await previewInvite(token.value)
    status.value = 'ready'
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Failed to load invite'
    status.value = 'error'
  } finally {
    loading.value = false
  }
})

async function handleGoogle() {
  busy.value = true
  errorMsg.value = ''
  try {
    await signInWithGoogle(`/invite/${token.value}`)
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Google sign-in failed'
    busy.value = false
  }
}

async function handleAccept() {
  busy.value = true
  errorMsg.value = ''
  try {
    await acceptInvite(token.value)
    status.value = 'done'
    await loadWorkspaces()
    await navigateTo('/customers')
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Failed to accept invite'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="auth-shell">
    <article class="auth-panel">
      <p class="eyebrow">Fran CRM</p>
      <h1 v-if="loading">Loading invite…</h1>
      <template v-else-if="preview?.status === 'pending'">
        <h1>Join {{ preview.workspace_name || 'workspace' }}</h1>
        <p class="muted-text">
          Invited as <strong class="capitalize">{{ preview.role }}</strong>.
          Sign in with Google using <strong>{{ preview.email }}</strong>.
        </p>

        <p v-if="errorMsg" class="form-error">{{ errorMsg }}</p>

        <button
          v-if="!user"
          class="primary-button"
          type="button"
          :disabled="busy || !isConfigured"
          @click="handleGoogle"
        >
          {{ busy ? 'Opening Google…' : 'Continue with Google' }}
        </button>

        <template v-else>
          <p class="notice-text">Signed in as {{ user.email }}</p>
          <button class="primary-button" type="button" :disabled="busy" @click="handleAccept">
            {{ busy ? 'Joining…' : `Join ${preview.workspace_name || 'workspace'}` }}
          </button>
        </template>
      </template>

      <template v-else>
        <h1>Invite unavailable</h1>
        <p class="muted-text">
          Status: {{ preview?.status || 'unknown' }}.
          <span v-if="preview?.workspace_name"> Workspace: {{ preview.workspace_name }}.</span>
        </p>
        <p v-if="errorMsg" class="form-error">{{ errorMsg }}</p>
        <NuxtLink class="secondary-button" to="/">Home</NuxtLink>
      </template>
    </article>
  </div>
</template>

<style scoped>
.auth-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: var(--space-6);
  background: var(--bg, #0f1419);
}
.auth-panel {
  width: min(420px, 100%);
  padding: var(--space-6);
  border: 1px solid var(--line, #2a3340);
  border-radius: var(--radius-lg, 12px);
  background: var(--panel, #151b24);
  display: grid;
  gap: var(--space-4);
}
.auth-panel h1 {
  margin: 0;
  font-size: var(--text-xl, 1.35rem);
}
.primary-button,
.secondary-button {
  display: inline-flex;
  justify-content: center;
  min-height: 40px;
  align-items: center;
  padding: 0 1rem;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  text-decoration: none;
}
.primary-button {
  background: #0d7377;
  color: #fff;
  font-weight: 600;
}
.secondary-button {
  background: transparent;
  border-color: #2a3340;
  color: #c5d0dc;
}
.form-error {
  color: #f87171;
  font-weight: 600;
  margin: 0;
}
.notice-text,
.muted-text {
  color: #94a3b8;
  margin: 0;
}
.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.75rem;
  color: #64748b;
  margin: 0;
}
</style>
