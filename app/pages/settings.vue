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
  Upload,
  UserPlus
} from '@lucide/vue'
import type { CrmInviteRole, CrmWorkspaceInvite } from '~/composables/useCrmWorkspaceInvites'

definePageMeta({
  middleware: 'authenticated-client'
})

const runtime = useRuntimeConfig()
const { isConfigured, refreshSession, startAuthListener, user } = useCrmAuth()
const { loadWorkspaces, pending: workspacePending, primaryWorkspace, requiresSetup } = useCrmWorkspaceAccess()
const {
  createInvite,
  inviteUrl,
  listInvites,
  listMembers,
  revokeInvite
} = useCrmWorkspaceInvites()

const copyNotice = ref('')
let copyTimer: ReturnType<typeof setTimeout> | null = null

const members = ref<Array<{ user_id: string; role: string; created_at: string }>>([])
const invites = ref<CrmWorkspaceInvite[]>([])
const teamLoading = ref(false)
const teamError = ref('')
const inviteEmail = ref('')
const inviteRole = ref<CrmInviteRole>('member')
const inviteBusy = ref(false)

const canManageTeam = computed(() => {
  const role = primaryWorkspace.value?.role
  return role === 'owner' || role === 'admin'
})

async function loadTeam() {
  if (!primaryWorkspace.value?.id || !user.value) {
    members.value = []
    invites.value = []
    return
  }
  teamLoading.value = true
  teamError.value = ''
  try {
    ;[members.value, invites.value] = await Promise.all([listMembers(), listInvites()])
  } catch (e) {
    teamError.value = e instanceof Error ? e.message : 'Failed to load team'
  } finally {
    teamLoading.value = false
  }
}

async function handleCreateInvite() {
  if (!inviteEmail.value.trim()) return
  inviteBusy.value = true
  teamError.value = ''
  try {
    const inv = await createInvite(inviteEmail.value, inviteRole.value)
    const url = inviteUrl(inv.token)
    try {
      await navigator.clipboard.writeText(url)
      copyNotice.value = `Invite created for ${inv.email}. Link copied.`
    } catch {
      copyNotice.value = `Invite created for ${inv.email}. Copy link from the list.`
    }
    inviteEmail.value = ''
    inviteRole.value = 'member'
    await loadTeam()
  } catch (e) {
    teamError.value = e instanceof Error ? e.message : 'Failed to create invite'
  } finally {
    inviteBusy.value = false
  }
}

async function handleCopyInvite(token: string) {
  try {
    await navigator.clipboard.writeText(inviteUrl(token))
    copyNotice.value = 'Invite link copied'
  } catch {
    teamError.value = 'Could not copy link'
  }
}

async function handleRevokeInvite(id: string) {
  if (!confirm('Revoke this invite?')) return
  try {
    await revokeInvite(id)
    await loadTeam()
    copyNotice.value = 'Invite revoked'
  } catch (e) {
    teamError.value = e instanceof Error ? e.message : 'Failed to revoke'
  }
}

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
    await loadTeam()
  }
})

watch(user, async (next) => {
  if (next) {
    await loadWorkspaces()
    await loadTeam()
  }
})

watch(primaryWorkspace, async (ws) => {
  if (ws?.id) await loadTeam()
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

    <!-- Team invites -->
    <section class="settings-panel integration-segment" aria-labelledby="settings-team">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Team</p>
          <h2 id="settings-team">Members & invites</h2>
          <p class="muted-text">
            Invite people to this CRM workspace with Google sign-in (same email). Prefer invites over creating a second company.
          </p>
        </div>
        <UserPlus :size="20" />
      </div>

      <p v-if="teamError" class="form-error">{{ teamError }}</p>
      <p v-if="teamLoading" class="muted-text">Loading team…</p>

      <form
        v-if="canManageTeam && primaryWorkspace"
        class="integration-id-panel"
        @submit.prevent="handleCreateInvite"
      >
        <div class="env-row">
          <strong>Invite email</strong>
          <input v-model="inviteEmail" type="email" class="input-field" required placeholder="colleague@gmail.com" />
          <select v-model="inviteRole" class="input-field" style="max-width: 8rem">
            <option value="member">member</option>
            <option value="admin">admin</option>
            <option value="agent">agent</option>
          </select>
        </div>
        <button class="primary-button" type="submit" :disabled="inviteBusy || !inviteEmail.trim()">
          {{ inviteBusy ? 'Creating…' : 'Invite + copy link' }}
        </button>
      </form>
      <p v-else-if="primaryWorkspace" class="muted-text">Only owners and admins can invite members.</p>
      <p v-else class="muted-text">
        <NuxtLink to="/setup">Join or create a company</NuxtLink> first.
      </p>

      <div v-if="members.length" class="connector-table">
        <article v-for="m in members" :key="m.user_id" class="connector-row">
          <CheckCircle2 :size="18" />
          <div>
            <strong class="font-mono text-sm">{{ m.user_id.slice(0, 8) }}…</strong>
            <p class="capitalize">{{ m.role }}</p>
          </div>
          <span class="status-pill" data-status="available">member</span>
        </article>
      </div>

      <div v-if="invites.length" class="connector-table">
        <p class="muted-text">Pending invites</p>
        <article v-for="inv in invites" :key="inv.id" class="connector-row">
          <Clock3 :size="18" />
          <div>
            <strong>{{ inv.email }}</strong>
            <p class="capitalize">{{ inv.role }} · expires {{ new Date(inv.expires_at).toLocaleDateString() }}</p>
          </div>
          <span class="integration-segment-actions">
            <button type="button" class="secondary-button" @click="handleCopyInvite(inv.token)">Copy link</button>
            <button type="button" class="secondary-button" @click="handleRevokeInvite(inv.id)">Revoke</button>
          </span>
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
