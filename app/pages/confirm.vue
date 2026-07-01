<script setup lang="ts">
import { normalizeAuthNextPath } from '~/utils/auth-redirect'

const route = useRoute()
const status = ref('Checking your session...')
const error = ref('')
const { getClient, isConfigured, refreshSession, startAuthListener } = useCrmAuth()
const { loadWorkspaces } = useCrmWorkspaceAccess()

const nextPath = computed(() => {
  const queryNext = Array.isArray(route.query.next) ? route.query.next[0] : route.query.next

  return normalizeAuthNextPath(typeof queryNext === 'string' ? queryNext : undefined, '')
})

function resolveConfirmErrorMessage(confirmError: unknown) {
  const message = confirmError instanceof Error ? confirmError.message : 'Unable to confirm this sign-in link.'

  if (message.toLowerCase().includes('code verifier')) {
    return 'This sign-in link must be opened in the same browser and app URL where sign-in was started. Please start sign-in again.'
  }

  return message
}

onMounted(async () => {
  if (!isConfigured.value) {
    status.value = 'Demo mode is active.'
    return
  }

  try {
    startAuthListener()
    const client = getClient()
    const code = Array.isArray(route.query.code) ? route.query.code[0] : route.query.code

    if (client && code) {
      const { error: exchangeError } = await client.auth.exchangeCodeForSession(code)

      if (exchangeError) {
        throw exchangeError
      }
    }

    const activeSession = await refreshSession()

    if (!activeSession) {
      status.value = 'No active session was found.'
      return
    }

    const access = await loadWorkspaces()
    await navigateTo(access?.requiresSetup ? '/setup' : nextPath.value || '/graph', { replace: true })
  } catch (confirmError) {
    error.value = resolveConfirmErrorMessage(confirmError)
    status.value = 'Sign-in confirmation failed.'
  }
})
</script>

<template>
  <div class="auth-page">
    <section class="auth-panel">
      <p class="eyebrow">Auth confirmed</p>
      <h2>{{ status }}</h2>
      <p v-if="error" class="form-error">{{ error }}</p>
      <NuxtLink class="primary-button" :to="{ path: '/login', query: { next: '/setup' } }">Continue</NuxtLink>
    </section>
  </div>
</template>
