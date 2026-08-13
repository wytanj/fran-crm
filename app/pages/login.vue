<script setup lang="ts">
import { LoaderCircle, LogIn } from '@lucide/vue'
import { normalizeAuthNextPath } from '~/utils/auth-redirect'

definePageMeta({
  layout: 'auth'
})

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
  <div>
    <div class="landing-hero-inner" style="margin-bottom: 24px; text-align: center">
      <p class="eyebrow">Fran team</p>
      <h1 class="h1-display" style="font-size: 36px">Fran CRM</h1>
      <p class="page-header-sub" style="margin-left: auto; margin-right: auto">Members, loyalty and POS contracts</p>
    </div>

    <form class="auth-panel" @submit.prevent="signIn">
      <h2>Sign in</h2>
      <p class="muted-text">Google, or a magic link to your work email.</p>
      <button class="secondary-button" type="button" :disabled="googlePending || !isConfigured" @click="continueWithGoogle">
        <LoaderCircle v-if="googlePending" class="button-spinner" :size="17" aria-hidden="true" />
        <svg v-else width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        <span>{{ googlePending ? 'Opening Google' : 'Continue with Google' }}</span>
      </button>
      <div class="auth-divider">
        <span>or email</span>
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
      <p v-if="sent" class="notice-text">Check your email for the sign-in link.</p>
      <p v-if="error" class="form-error">{{ error }}</p>
      <p class="notice-text">New accounts continue to company setup.</p>
    </form>
  </div>
</template>
