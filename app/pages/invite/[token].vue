<script setup lang="ts">
definePageMeta({
  layout: 'auth'
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
  <div>
    <div class="landing-hero-inner" style="margin-bottom: 24px; text-align: center">
      <p class="eyebrow">Fran team</p>
      <h1 class="h1-display" style="font-size: 36px">Fran CRM</h1>
    </div>
    <article class="auth-panel">
      <p class="eyebrow">Workspace invite</p>
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
