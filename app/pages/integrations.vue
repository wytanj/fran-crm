<script setup lang="ts">
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Copy,
  PlugZap,
  ScanLine,
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

/** Inbound register path — configured on SKUMS, not as a CRM connector secret. */
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

/** Source systems that feed the customer graph (not the live register path). */
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
        <p class="eyebrow">Integrations</p>
        <h2>Three different connection paths</h2>
        <p>
          Registers, source imports, and agents do not share one setup form. Use the segment that matches what you are connecting.
        </p>
      </div>
      <PlugZap :size="24" />
    </div>

    <p v-if="copyNotice" class="notice-text" role="status">{{ copyNotice }}</p>

    <!-- Segment 1: POS / SKUMS (inbound runtime) -->
    <section class="settings-panel integration-segment" aria-labelledby="segment-register">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Segment 1 · Registers</p>
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
        <NuxtLink class="secondary-button" to="/fran">
          <ScanLine :size="15" />
          POS route contracts
          <ArrowRight :size="14" />
        </NuxtLink>
        <NuxtLink class="secondary-button" to="/setup">
          Company workspace
          <ArrowRight :size="14" />
        </NuxtLink>
      </div>
    </section>

    <!-- Segment 2: Source data into the graph -->
    <section class="settings-panel integration-segment" aria-labelledby="segment-sources">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Segment 2 · Source data</p>
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

    <!-- Segment 3: Agents -->
    <section class="settings-panel integration-segment" aria-labelledby="segment-agents">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Segment 3 · Agents</p>
          <h2 id="segment-agents">Proposals and MCP</h2>
          <p class="muted-text">
            Agents propose schema and operational changes under workspace capability grants. They do not replace the POS → SKUMS → CRM loyalty path.
          </p>
        </div>
        <PlugZap :size="20" />
      </div>

      <div class="integration-segment-actions">
        <NuxtLink class="secondary-button" to="/agents">
          Agent workbench
          <ArrowRight :size="14" />
        </NuxtLink>
        <NuxtLink class="secondary-button" to="/docs/agents">
          Agent protocol
          <ArrowRight :size="14" />
        </NuxtLink>
      </div>
    </section>
  </div>
</template>
