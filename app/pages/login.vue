<script setup lang="ts">
import { LogIn } from '@lucide/vue'

const email = ref('')
const sent = ref(false)
const error = ref('')
const { isConfigured, signInWithOtp } = useCrmAuth()

async function signIn() {
  error.value = ''

  if (!isConfigured.value) {
    sent.value = true
    return
  }

  try {
    await signInWithOtp(email.value)
    sent.value = true
  } catch (signInError) {
    error.value = signInError instanceof Error ? signInError.message : 'Unable to send sign-in link.'
  }
}
</script>

<template>
  <div class="auth-page">
    <form class="auth-panel" @submit.prevent="signIn">
      <p class="eyebrow">Workspace access</p>
      <h2>Sign in to your CRM workspace</h2>
      <label>
        <span>Email</span>
        <input v-model="email" type="email" placeholder="you@company.com" required />
      </label>
      <button class="primary-button" type="submit">
        <LogIn :size="17" />
        <span>Send magic link</span>
      </button>
      <p v-if="sent" class="notice-text">Check your email for the sign-in link. In demo mode this confirms the auth flow shape.</p>
      <p v-if="error" class="form-error">{{ error }}</p>
      <NuxtLink class="secondary-button" to="/setup">Set up company after sign-in</NuxtLink>
    </form>
  </div>
</template>
