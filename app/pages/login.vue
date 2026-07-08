<script setup lang="ts">
import { LoaderCircle, LogIn, UserRound } from '@lucide/vue'
import { normalizeAuthNextPath } from '~/utils/auth-redirect'

const route = useRoute()
const email = ref('')
const sent = ref(false)
const error = ref('')
const emailPending = ref(false)
const googlePending = ref(false)
const { isConfigured, signInWithGoogle, signInWithOtp } = useCrmAuth()
const nextPath = computed(() => {
  const queryNext = Array.isArray(route.query.next) ? route.query.next[0] : route.query.next

  return normalizeAuthNextPath(typeof queryNext === 'string' ? queryNext : undefined, '/setup')
})

async function continueWithGoogle() {
  error.value = ''

  if (!isConfigured.value) {
    error.value = 'Supabase Auth is not configured for this environment.'
    return
  }

  googlePending.value = true

  try {
    await signInWithGoogle(nextPath.value)
  } catch (signInError) {
    error.value = signInError instanceof Error ? signInError.message : 'Unable to start Google sign-in.'
  } finally {
    googlePending.value = false
  }
}

async function signIn() {
  error.value = ''

  if (!isConfigured.value) {
    sent.value = true
    return
  }

  try {
    emailPending.value = true
    await signInWithOtp(email.value, nextPath.value)
    sent.value = true
  } catch (signInError) {
    error.value = signInError instanceof Error ? signInError.message : 'Unable to send sign-in link.'
  } finally {
    emailPending.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <form class="auth-panel" @submit.prevent="signIn">
      <p class="eyebrow">Workspace access</p>
      <h2>Sign in to your CRM workspace</h2>
      <button class="primary-button" type="button" :disabled="googlePending || !isConfigured" @click="continueWithGoogle">
        <LoaderCircle v-if="googlePending" class="button-spinner" :size="17" aria-hidden="true" />
        <UserRound v-else :size="17" />
        <span>{{ googlePending ? 'Opening Google' : 'Continue with Google' }}</span>
      </button>
      <div class="auth-divider">
        <span>or</span>
      </div>
      <label>
        <span>Email</span>
        <input v-model="email" type="email" placeholder="you@company.com" required />
      </label>
      <button class="primary-button" type="submit" :disabled="emailPending">
        <LoaderCircle v-if="emailPending" class="button-spinner" :size="17" aria-hidden="true" />
        <LogIn v-else :size="17" />
        <span>{{ emailPending ? 'Sending link' : 'Send magic link' }}</span>
      </button>
      <p v-if="sent" class="notice-text">Check your email for the sign-in link. In demo mode this confirms the auth flow shape.</p>
      <p v-if="error" class="form-error">{{ error }}</p>
      <p class="notice-text">Company setup opens after sign-in when your user has no workspace yet.</p>
    </form>
  </div>
</template>
