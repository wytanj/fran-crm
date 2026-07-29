<script setup lang="ts">
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Copy,
  Database,
  KeyRound,
  PlugZap,
  Store,
  Upload
} from '@lucide/vue'

definePageMeta({
  middleware: 'authenticated-client'
})

const runtime = useRuntimeConfig()
const { isConfigured, refreshSession, startAuthListener, user } = useCrmAuth()
const { loadWorkspaces, pending: workspacePending, primaryWorkspace, requiresSetup } = useCrmWorkspaceAccess()

const copyNotice = ref('')
let copyTimer: ReturnType<typeof setTimeout> | null = null

const envRows = [
  { key: 'NUXT_PUBLIC_SUPABASE_URL', value: runtime.public.supabaseUrl || 'not set' },
  { key: 'NUXT_PUBLIC_SUPABASE_ANON_KEY', value: runtime.public.supabaseKey ? 'configured' : 'not set' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', value: 'server only' },
  { key: 'NUXT_PUBLIC_BILLING_MODE', value: runtime.public.billingMode }
]

const crmBaseUrl = computed(() => {
  const fromRuntime = String(runtime.public.siteUrl || '').trim().replace(/\/+$/, '')
  if (fromRuntime) return fromRuntime
  if (import.meta.client && typeof window !== 'undefined') return window.location.origin
  return 'https://fran-crm-eight.vercel.app'
})

const workspaceId = computed(() => primaryWorkspace.value?.id || '')
const workspaceLabel = computed(() => {
  if (workspacePending.value) return 'Loading workspace…'
  if (!user.value) return 'Sign in to load your CRM workspace'
  if (requiresSetup.value || !primaryWorkspace.value) return 'Create a company workspace first'
  return primaryWorkspace.value.name
})

const registerSteps = [
  {
    title: 'CRM workspace ID',
    detail: 'Copy the ID on this page. That is the CRM tenant SKUMS should call.'
  },
  {
    title: 'Link CRM on SKUMS',
    detail: 'SKUMS HQ → Integrations → Fran CRM (POS loyalty). Paste base URL + workspace ID.'
  },
  {
    title: 'POS holds only a SKUMS key',
    detail: 'Register Settings → SKUMS connector (pos:read + pos:write). No CRM secret on the tablet.'
  },
  {
    title: 'Loyalty traffic path',
    detail: 'POS → SKUMS /fran/pos/loyalty/* → this CRM. Policy, member resolve, commit_sale.'
  }
]

const sourceConnectors = [
  {
    name: 'CSV import',
    status: 'available' as const,
    scope: 'Manual staging for people, companies, orders, and attributes'
  },
  {
    name: 'Shopify',
    status: 'planned' as const,
    scope: 'Customers, orders, products, consent, tags'
  },
  {
    name: 'Support desk',
    status: 'planned' as const,
    scope: 'Tickets, messages, sentiment, resolution outcomes'
  },
  {
    name: 'Email / SMS',
    status: 'planned' as const,
    scope: 'Consent, campaigns, clicks, unsubscribes'
  }
]

onMounted(async () => {
  startAuthListener()
  await refreshSession()
  if (user.value || !isConfigured.value) {
    await loadWorkspaces()
  }
})

watch(user, async (next) => {
  if (next) await loadWorkspaces()
})

async function copyText(value: string, label: string) {
  if (!value) return
  copyNotice.value = ''
  try {
    await navigator.clipboard.writeText(value)
    copyNotice.value = `${label} copied`
  } catch {
    copyNotice.value = `Could not copy ${label}`
  }
  if (copyTimer) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => {
    copyNotice.value = ''
  }, 2500)
}
</script>

<template>
  <div class="page-stack">
    <div class="intro-strip">
      <div>
        <p class="eyebrow">Settings</p>
        <h2>Host config and integrations</h2>
        <p>Supabase environment for this deploy, plus how POS and source systems connect to this CRM workspace.</p>
      </div>
      <Database :size="24" />
    </div>

    <p v-if="copyNotice" class="notice-text" role="status">{{ copyNotice }}</p>

    <!-- Self-host -->
    <section class="settings-panel integration-segment" aria-labelledby="settings-host">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Self-host</p>
          <h2 id="settings-host">Supabase project</h2>
          <p class="muted-text">Apply migrations, then point the Nuxt app at your project keys.</p>
        </div>
        <KeyRound :size="20" />
      </div>

      <div class="settings-grid">
        <article>
          <div class="section-heading compact-heading">
            <div>
              <p class="eyebrow">Environment</p>
              <h2>Current key status</h2>
            </div>
          </div>
          <div v-for="row in envRows" :key="row.key" class="env-row">
            <strong>{{ row.key }}</strong>
            <span>{{ row.value }}</span>
          </div>
        </article>
        <article>
          <div class="section-heading compact-heading">
            <div>
              <p class="eyebrow">Migration</p>
              <h2>Database setup</h2>
            </div>
            <Copy :size="18" />
          </div>
          <div class="code-panel">
            <pre>supabase/migrations/0001_headless_crm.sql
… through 0010_fran_loyalty_point_batches.sql</pre>
          </div>
          <p class="muted-text">
            Covers workspace membership, graph entities, profile packs, loyalty analytics, point batches, MCP logs, and audit events.
          </p>
        </article>
      </div>
    </section>

    <!-- Integrations (was /integrations) -->
    <section id="integrations" class="settings-panel integration-segment" aria-labelledby="settings-integrations">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Integrations</p>
          <h2 id="settings-integrations">How systems connect</h2>
          <p class="muted-text">
            Registers and source imports are different paths. Use the segment that matches what you are connecting.
          </p>
        </div>
        <PlugZap :size="20" />
      </div>
    </section>

    <section class="settings-panel integration-segment" aria-labelledby="segment-register">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Registers</p>
          <h2 id="segment-register">Fran POS via SKUMS</h2>
          <p class="muted-text">
            Live loyalty and counter traffic. CRM is linked from the SKUMS workspace — not by pasting a SKUMS key into this app.
          </p>
        </div>
        <Store :size="20" />
      </div>

      <div class="notice-bar">
        Do <strong>not</strong> put CRM service credentials or Supabase keys on the POS tablet.
        POS talks to <strong>SKUMS only</strong>; SKUMS calls CRM server-to-server.
      </div>

      <div class="integration-id-panel">
        <div class="env-row">
          <strong>CRM base URL</strong>
          <span class="mono-value">{{ crmBaseUrl }}</span>
          <button
            class="secondary-button"
            type="button"
            :disabled="!crmBaseUrl"
            @click="copyText(crmBaseUrl, 'CRM base URL')"
          >
            <Copy :size="15" />
            Copy
          </button>
        </div>
        <div class="env-row">
          <strong>CRM workspace ID</strong>
          <span class="mono-value">{{ workspaceId || workspaceLabel }}</span>
          <button
            class="secondary-button"
            type="button"
            :disabled="!workspaceId"
            @click="copyText(workspaceId, 'CRM workspace ID')"
          >
            <Copy :size="15" />
            Copy
          </button>
        </div>
        <p v-if="!workspaceId" class="muted-text">
          <template v-if="!user">
            <NuxtLink to="/login">Sign in</NuxtLink> to load your workspace ID.
          </template>
          <template v-else-if="requiresSetup">
            <NuxtLink to="/setup">Create company workspace</NuxtLink> first, then return here to copy the ID.
          </template>
          <template v-else>
            Workspace still loading…
          </template>
        </p>
        <p v-else class="muted-text">
          Paste into <strong>Fran SKUMS → Integrations → Fran CRM → CRM workspace ID</strong>
          (test SKUMS workspace is separate from this UUID).
        </p>
      </div>

      <div class="capability-list integration-steps">
        <article v-for="(step, index) in registerSteps" :key="step.title" class="capability-row">
          <span class="step-index" aria-hidden="true">{{ index + 1 }}</span>
          <div>
            <strong>{{ step.title }}</strong>
            <p class="muted-text">{{ step.detail }}</p>
          </div>
        </article>
      </div>

      <div class="integration-segment-actions">
        <NuxtLink class="secondary-button" to="/docs/fran-pos">
          POS route contracts
          <ArrowRight :size="14" />
        </NuxtLink>
        <NuxtLink class="secondary-button" to="/setup">
          Company workspace
          <ArrowRight :size="14" />
        </NuxtLink>
      </div>
    </section>

    <section class="settings-panel integration-segment" aria-labelledby="segment-sources">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Source data</p>
          <h2 id="segment-sources">Connectors into the customer graph</h2>
          <p class="muted-text">
            How people, orders, and support history enter CRM. These are not the live register path.
          </p>
        </div>
        <Upload :size="20" />
      </div>

      <div class="connector-table">
        <article v-for="connector in sourceConnectors" :key="connector.name" class="connector-row">
          <component :is="connector.status === 'available' ? CheckCircle2 : Clock3" :size="18" />
          <div>
            <strong>{{ connector.name }}</strong>
            <p>{{ connector.scope }}</p>
          </div>
          <span class="status-pill" :data-status="connector.status">{{ connector.status }}</span>
        </article>
      </div>
    </section>
  </div>
</template>
