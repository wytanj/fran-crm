<script setup lang="ts">
import { Building2, CreditCard, Server } from '@lucide/vue'

definePageMeta({
  middleware: 'authenticated-client'
})

const route = useRoute()
const { refreshSession, startAuthListener, user } = useCrmAuth()

const billingNotice = computed(() => {
  if (route.query.checkout !== 'demo') {
    return ''
  }

  return `Demo billing boundary recorded for ${route.query.email || 'the selected email'} on ${route.query.plan || 'the selected workspace mode'}.`
})

const configureSettingsPath = computed(() => user.value
  ? '/settings'
  : {
      path: '/login',
      query: {
        next: '/settings'
      }
    })

const modes = [
  {
    icon: Server,
    label: 'Local mode',
    detail: 'Use demo data and local fixtures while Fran POS contracts are being shaped.'
  },
  {
    icon: Building2,
    label: 'Workspace mode',
    detail: 'Use Supabase auth, workspace membership, profile packs, and server-side persistence.'
  },
  {
    icon: CreditCard,
    label: 'Billing boundary',
    detail: 'Inherited crmOS billing records remain available for internal workspace accounting.'
  }
]

onMounted(async () => {
  startAuthListener()
  await refreshSession()
})
</script>

<template>
  <div class="page-stack">
    <div v-if="billingNotice" class="notice-bar">{{ billingNotice }}</div>
    <div class="intro-strip">
      <div>
        <p class="eyebrow">Workspace mode</p>
        <h2>Fran CRM keeps billing and workspace setup as internal operating boundaries, not acquisition flows.</h2>
      </div>
      <NuxtLink class="secondary-button" :to="configureSettingsPath">
        {{ user ? 'Configure Supabase' : 'Sign in to configure' }}
      </NuxtLink>
    </div>

    <section class="docs-card-grid">
      <article v-for="mode in modes" :key="mode.label" class="doc-card">
        <component :is="mode.icon" :size="20" />
        <h3>{{ mode.label }}</h3>
        <p>{{ mode.detail }}</p>
      </article>
    </section>
  </div>
</template>
