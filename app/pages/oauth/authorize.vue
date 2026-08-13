<script setup lang="ts">
definePageMeta({ layout: 'auth' })

type PendingInvite = {
  token: string
  role: string
  workspace_name: string | null
}

type AuthorizeInfo = {
  signed_in: boolean
  email?: string | null
  workspace_id?: string | null
  workspace_name?: string | null
  skums_workspace_id?: string | null
  workspace_ambiguous?: boolean
  role?: string | null
  tool_count?: number
  tool_names?: string[]
  can_authorize?: boolean
  pending_invites?: PendingInvite[]
  reason?: string | null
  scope?: string
}

const route = useRoute()
const { refreshSession, session, signOut, startAuthListener } = useCrmAuth()
const { acceptInvite } = useCrmWorkspaceInvites()

const info = ref<AuthorizeInfo | null>(null)
const loading = ref(true)
const approving = ref(false)
const accepting = ref<string | null>(null)
const error = ref('')
const showTools = ref(false)

function returnPath() {
  return route.fullPath
}

function loginUrl() {
  return { path: '/login', query: { next: returnPath() } }
}

async function authHeaders() {
  const active = session.value || await refreshSession()
  if (!active?.access_token) return undefined
  return { Authorization: `Bearer ${active.access_token}` }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    startAuthListener()
    await refreshSession()
    const headers = await authHeaders()
    if (!headers) {
      await navigateTo(loginUrl())
      return
    }

    const data = await $fetch<AuthorizeInfo>('/api/oauth/authorize-info', {
      query: route.query,
      headers
    })
    if (!data.signed_in) {
      await navigateTo(loginUrl())
      return
    }
    info.value = data
  } catch (loadError: unknown) {
    const err = loadError as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value = err?.data?.statusMessage || err?.statusMessage || err?.message || 'Could not read the request.'
  } finally {
    loading.value = false
  }
}

async function approve() {
  approving.value = true
  error.value = ''
  try {
    const headers = await authHeaders()
    const res = await $fetch<{ redirect_url: string }>('/api/oauth/approve', {
      method: 'POST',
      headers,
      body: { ...route.query }
    })
    window.location.href = res.redirect_url
  } catch (approveError: unknown) {
    const err = approveError as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value = err?.data?.statusMessage || err?.statusMessage || err?.message || 'Could not authorize.'
    approving.value = false
  }
}

async function acceptAndReload(invite: PendingInvite) {
  accepting.value = invite.token
  error.value = ''
  try {
    await acceptInvite(invite.token)
    await load()
  } catch (joinError: unknown) {
    error.value = joinError instanceof Error ? joinError.message : 'Could not accept the invitation.'
  } finally {
    accepting.value = null
  }
}

async function switchAccount() {
  try {
    await signOut()
  } catch {
    // best effort
  }
  await navigateTo(loginUrl())
}

onMounted(load)
</script>

<template>
  <div>
    <div class="landing-hero-inner" style="margin-bottom: 24px; text-align: center">
      <p class="eyebrow">Claude connector</p>
      <h1 class="h1-display" style="font-size: 36px">Connect Claude</h1>
      <p class="page-header-sub" style="margin-left: auto; margin-right: auto">
        Claude will act with your Fran CRM permissions — nothing more.
      </p>
    </div>

    <section class="auth-panel">
      <p v-if="loading" class="notice-text">Checking your account…</p>
      <p v-else-if="error" class="form-error">{{ error }}</p>

      <template v-else-if="info">
        <div class="env-row">
          <span>Signed in as</span>
          <strong>{{ info.email || 'unknown' }}</strong>
        </div>
        <div class="env-row">
          <span>CRM workspace</span>
          <strong>{{ info.workspace_name || '—' }}</strong>
        </div>
        <div class="env-row">
          <span>Your role</span>
          <strong class="capitalize">{{ info.role || '—' }}</strong>
        </div>
        <div class="env-row">
          <span>Tools Claude will get</span>
          <strong>
            {{ info.tool_count }}
            <button v-if="info.tool_names?.length" type="button" class="secondary-button" @click="showTools = !showTools">
              {{ showTools ? 'Hide' : 'Show' }}
            </button>
          </strong>
        </div>
        <p v-if="showTools" class="notice-text">{{ info.tool_names?.join(', ') }}</p>

        <p v-if="info.workspace_ambiguous" class="notice-bar">
          You belong to more than one CRM workspace. Connecting to <strong>{{ info.workspace_name }}</strong>.
        </p>
        <p v-if="!info.can_authorize && info.reason" class="notice-bar">{{ info.reason }}</p>

        <div v-if="!info.can_authorize && info.pending_invites?.length">
          <article v-for="inv in info.pending_invites" :key="inv.token" class="notice-bar">
            <strong>{{ inv.workspace_name || 'Workspace' }}</strong>
            <span class="muted-text capitalize"> · {{ inv.role }}</span>
            <div class="setup-auth-actions" style="margin-top: 0.75rem">
              <button class="primary-button" type="button" :disabled="accepting === inv.token" @click="acceptAndReload(inv)">
                {{ accepting === inv.token ? 'Joining…' : 'Accept invitation' }}
              </button>
            </div>
          </article>
        </div>

        <button class="primary-button" type="button" :disabled="approving || !info.can_authorize" @click="approve">
          {{ approving ? 'Authorizing…' : 'Authorize Claude' }}
        </button>
        <button class="secondary-button" type="button" @click="switchAccount">Use a different account</button>
        <p class="notice-text">
          Permissions are re-checked on every request. Offboarding is a CRM invite revoke or membership removal — not a key rotation.
        </p>
      </template>
    </section>
  </div>
</template>
