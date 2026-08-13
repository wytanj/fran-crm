<script setup lang="ts">
import { Building2, CheckCircle2, LoaderCircle, UserRound } from '@lucide/vue'
import type { WorkspaceSetupPayload } from '~/types/crm'
import type { PendingCrmInvite } from '~/composables/useCrmWorkspaceInvites'

definePageMeta({
  middleware: 'authenticated-client'
})

const { isConfigured, session, signInWithGoogle, user } = useCrmAuth()
const {
  canCreateWorkspace,
  createKind,
  createWorkspace,
  error,
  loadWorkspaces,
  pending,
  primaryWorkspace
} = useCrmWorkspaceAccess()
const { acceptInvite, listMyPending } = useCrmWorkspaceInvites()

const form = reactive<WorkspaceSetupPayload>({
  companyName: '',
  slug: '',
  plan: 'hosted_growth',
  skumsWorkspaceId: ''
})

type SkumsOption = {
  id: string
  name: string
  role: string
  alreadyLinked: boolean
  linkedCrmWorkspaceId: string | null
}

const skumsWorkspaces = ref<SkumsOption[]>([])
const skumsReason = ref('')
const loadingSkums = ref(false)
const created = ref(false)
const creatingWorkspace = ref(false)
const googlePending = ref(false)
const authError = ref('')
const slugEdited = ref(false)
const pendingInvites = ref<PendingCrmInvite[]>([])
const loadingInvites = ref(false)
const showCreateForm = ref(false)
const joining = ref(false)
const joinError = ref('')

const openSkumsWorkspaces = computed(() => skumsWorkspaces.value.filter((workspace) => !workspace.alreadyLinked))
const linkedSkumsWorkspaces = computed(() => skumsWorkspaces.value.filter((workspace) => workspace.alreadyLinked))
const mustSignIn = computed(() => isConfigured.value && !user.value)
const isSandboxCreate = computed(() => createKind.value === 'sandbox')
const submitLabel = computed(() => {
  if (primaryWorkspace.value) {
    return 'Open company workspace'
  }

  if (creatingWorkspace.value) {
    return isSandboxCreate.value ? 'Creating sandbox workspace' : 'Creating workspace'
  }

  return isSandboxCreate.value ? 'Create sandbox workspace' : 'Create company workspace'
})
const workspaceLoadingTitle = computed(() => creatingWorkspace.value ? 'Creating workspace' : 'Loading workspace access')
const workspaceLoadingDetail = computed(() => {
  if (primaryWorkspace.value) {
    return 'Refreshing membership and owner access.'
  }

  if (creatingWorkspace.value) {
    return 'Writing ownership and installing the default surface.'
  }

  return 'Checking whether your workspace already exists.'
})

function normalizeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 54)
}

function titleCase(input: string) {
  return input
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function inferCompanyName(email?: string) {
  if (createKind.value === 'sandbox') {
    return 'Fran Sandbox'
  }

  if (createKind.value === 'production') {
    return 'Fran'
  }

  const domain = email?.split('@')[1]?.split('.')[0] || ''
  const blockedDomains = new Set(['gmail', 'googlemail', 'hotmail', 'icloud', 'me', 'outlook', 'proton', 'yahoo'])

  if (!domain || blockedDomains.has(domain)) {
    return ''
  }

  return titleCase(domain)
}

function fillSuggestedCompany() {
  if (primaryWorkspace.value || form.companyName) {
    return
  }

  const suggestedName = inferCompanyName(user.value?.email)

  if (!suggestedName) {
    return
  }

  form.companyName = suggestedName
  form.slug = normalizeSlug(suggestedName)
}

async function loadSkumsWorkspaces() {
  if (!user.value) {
    skumsWorkspaces.value = []
    return
  }
  loadingSkums.value = true
  try {
    const headers = session.value?.access_token
      ? { Authorization: `Bearer ${session.value.access_token}` }
      : undefined
    const listed = await $fetch<{ reason: string | null; workspaces: SkumsOption[] }>('/api/crm/skums-workspaces', { headers })
    skumsWorkspaces.value = listed.workspaces
    skumsReason.value = listed.reason || ''
    const open = listed.workspaces.find((workspace) => !workspace.alreadyLinked)
    if (open && !form.skumsWorkspaceId) {
      selectSkumsWorkspace(open.id)
    }
  } catch (loadError) {
    skumsReason.value = loadError instanceof Error ? loadError.message : 'Could not load SKUMS workspaces.'
  } finally {
    loadingSkums.value = false
  }
}

function selectSkumsWorkspace(id: string) {
  form.skumsWorkspaceId = id
  const selected = skumsWorkspaces.value.find((workspace) => workspace.id === id)
  if (!selected) return
  if (!form.companyName) form.companyName = selected.name
  if (!slugEdited.value) form.slug = normalizeSlug(selected.name)
}

async function loadPendingInvites() {
  if (!user.value) {
    pendingInvites.value = []
    showCreateForm.value = true
    return
  }
  loadingInvites.value = true
  joinError.value = ''
  try {
    pendingInvites.value = await listMyPending()
    showCreateForm.value = pendingInvites.value.length === 0 && canCreateWorkspace.value
  } catch {
    showCreateForm.value = canCreateWorkspace.value
  } finally {
    loadingInvites.value = false
  }
}

onMounted(async () => {
  const { ensureReady } = useCrmAppReady()
  await ensureReady()

  if (user.value || !isConfigured.value) {
    await loadSkumsWorkspaces()
  }

  if (primaryWorkspace.value) {
    form.companyName = primaryWorkspace.value.name
    form.slug = primaryWorkspace.value.slug
  } else {
    fillSuggestedCompany()
    await loadPendingInvites()
  }
})

watch(user, async () => {
  fillSuggestedCompany()
  if (user.value && !primaryWorkspace.value) {
    await loadPendingInvites()
  }
})

watch(createKind, () => {
  fillSuggestedCompany()
})

watch(() => form.companyName, (companyName) => {
  if (!slugEdited.value || !form.slug) {
    form.slug = normalizeSlug(companyName)
  }
})

function handleSlugInput() {
  slugEdited.value = true
  form.slug = normalizeSlug(form.slug || '')
}

async function continueWithGoogle() {
  authError.value = ''

  if (!isConfigured.value) {
    authError.value = 'Supabase Auth is not configured for this environment.'
    return
  }

  googlePending.value = true

  try {
    await signInWithGoogle('/setup')
  } catch (signInError) {
    authError.value = signInError instanceof Error ? signInError.message : 'Unable to start Google sign-in.'
  } finally {
    googlePending.value = false
  }
}

async function joinInvite(inv: PendingCrmInvite) {
  joining.value = true
  joinError.value = ''
  try {
    await acceptInvite(inv.token)
    await loadWorkspaces(true)
    await navigateTo('/customers')
  } catch (e) {
    joinError.value = e instanceof Error ? e.message : 'Failed to join workspace'
  } finally {
    joining.value = false
  }
}

async function submitSetup() {
  if (primaryWorkspace.value?.id) {
    await navigateTo('/customers')
    return
  }

  creatingWorkspace.value = true

  try {
    if (!form.skumsWorkspaceId) {
      authError.value = 'Pick the existing SKUMS business workspace this CRM belongs to.'
      return
    }

    const workspace = await createWorkspace({
      companyName: form.companyName,
      slug: form.slug,
      plan: form.plan,
      skumsWorkspaceId: form.skumsWorkspaceId
    })

    created.value = true

    if (workspace.id) {
      await navigateTo('/customers')
    }
  } finally {
    creatingWorkspace.value = false
  }
}
</script>

<template>
  <div class="page-stack">
    <div class="intro-strip">
      <div>
        <p class="eyebrow">Company setup</p>
        <h2 v-if="pendingInvites.length && !primaryWorkspace">Join your team</h2>
        <h2 v-else-if="!canCreateWorkspace && !primaryWorkspace">Ask an owner to invite you</h2>
        <h2 v-else-if="isSandboxCreate && !primaryWorkspace">Create a sandbox CRM</h2>
        <h2 v-else>Attach CRM to a SKUMS workspace</h2>
        <p v-if="pendingInvites.length && !primaryWorkspace">
          Accept an invite to Fran CRM. Prefer this over creating a second tenant on the same SKUMS workspace.
        </p>
        <p v-else-if="!canCreateWorkspace && !primaryWorkspace">
          {{ user?.email || 'This account' }} isn't allowed to create a CRM workspace. Ask a Fran owner to invite this email, then sign in again.
        </p>
        <p v-else-if="isSandboxCreate && !primaryWorkspace">
          This Google account can create an isolated dummy workspace. Production Fran CRM stays on @heyfran.com.
        </p>
        <p v-else>CRM must live on an existing Fran SKUMS business workspace. Invite colleagues after that link exists.</p>
      </div>
      <Building2 :size="24" />
    </div>

    <section class="setup-grid">
      <div class="settings-panel setup-form">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Master workspace</p>
            <h2>Company profile</h2>
          </div>
        </div>

        <div v-if="primaryWorkspace" class="notice-bar">
          Current workspace: {{ primaryWorkspace.name }} ({{ primaryWorkspace.role }})
        </div>

        <LoadingPanel
          v-else-if="pending || creatingWorkspace || loadingInvites"
          :title="workspaceLoadingTitle"
          :detail="workspaceLoadingDetail"
          compact
        />

        <div v-if="mustSignIn" class="notice-bar">
          Sign in first so the company is assigned to you as owner.
          <div class="setup-auth-actions">
            <button class="primary-button" type="button" :disabled="googlePending || !isConfigured" @click="continueWithGoogle">
              <LoaderCircle v-if="googlePending" class="button-spinner" :size="17" aria-hidden="true" />
              <UserRound v-else :size="17" />
              <span>{{ googlePending ? 'Opening Google' : 'Continue with Google' }}</span>
            </button>
            <NuxtLink class="secondary-button" to="/login">Use email link</NuxtLink>
          </div>
        </div>

        <template v-if="!mustSignIn && !primaryWorkspace && !loadingInvites">
          <div v-if="!canCreateWorkspace && !pendingInvites.length" class="notice-bar">
            You're not a member yet. Joining Fran CRM is invite-only unless this Google account is on the create allowlist.
          </div>

          <div v-if="pendingInvites.length" class="space-stack">
            <article v-for="inv in pendingInvites" :key="inv.id" class="notice-bar">
              <strong>{{ inv.workspace_name }}</strong>
              <span class="muted-text capitalize"> · {{ inv.role }}</span>
              <div class="setup-auth-actions" style="margin-top: 0.75rem">
                <button class="primary-button" type="button" :disabled="joining" @click="joinInvite(inv)">
                  {{ joining ? 'Joining…' : `Join ${inv.workspace_name}` }}
                </button>
              </div>
            </article>
            <p v-if="joinError" class="form-error">{{ joinError }}</p>
            <button
              v-if="!showCreateForm && canCreateWorkspace"
              type="button"
              class="secondary-button"
              @click="showCreateForm = true"
            >
              Create a new workspace instead
            </button>
          </div>

          <form v-if="canCreateWorkspace && (showCreateForm || !pendingInvites.length)" class="space-stack" @submit.prevent="submitSetup">
            <p v-if="isSandboxCreate" class="notice-bar">
              Sandbox tenant — isolated from the real @heyfran.com Fran workspace.
            </p>
            <p v-if="pendingInvites.length" class="muted-text">
              Creating a new CRM tenant still needs a SKUMS workspace that is not already linked. Prefer joining if you were invited.
            </p>
            <p v-if="skumsReason" class="notice-bar">{{ skumsReason }}</p>
            <label>
              <span>SKUMS business workspace</span>
              <select
                v-model="form.skumsWorkspaceId"
                required
                :disabled="loadingSkums || !openSkumsWorkspaces.length"
                @change="selectSkumsWorkspace(form.skumsWorkspaceId)"
              >
                <option value="" disabled>Select a SKUMS workspace</option>
                <option v-for="workspace in openSkumsWorkspaces" :key="workspace.id" :value="workspace.id">
                  {{ workspace.name }} ({{ workspace.role }})
                </option>
              </select>
            </label>
            <p v-if="linkedSkumsWorkspaces.length" class="muted-text">
              Already linked: {{ linkedSkumsWorkspaces.map((workspace) => workspace.name).join(', ') }}. Join that CRM instead of creating another.
            </p>
            <label>
              <span>Company name</span>
              <input v-model="form.companyName" type="text" placeholder="Fran" required />
            </label>
            <label>
              <span>Workspace slug</span>
              <input v-model="form.slug" type="text" placeholder="fran" pattern="[a-z0-9]+(-[a-z0-9]+)*" @input="handleSlugInput" />
            </label>
            <label>
              <span>Workspace mode</span>
              <select v-model="form.plan">
                <option value="hosted_growth">Fran Workspace</option>
                <option value="hosted_scale">Fran Scale</option>
              </select>
            </label>

            <button class="primary-button" type="submit" :disabled="pending || creatingWorkspace || mustSignIn">
              <LoaderCircle v-if="pending || creatingWorkspace" class="button-spinner" :size="17" aria-hidden="true" />
              <CheckCircle2 v-else :size="17" />
              <span>{{ submitLabel }}</span>
            </button>

            <p v-if="created" class="notice-text">Workspace created.</p>
            <p v-if="authError" class="form-error">{{ authError }}</p>
            <p v-if="error" class="form-error">{{ error }}</p>
          </form>
        </template>

        <div v-if="primaryWorkspace" class="setup-auth-actions">
          <button class="primary-button" type="button" @click="navigateTo('/customers')">
            Open company workspace
          </button>
        </div>
      </div>

      <section class="settings-panel setup-checklist">
        <p class="eyebrow">Created on setup</p>
        <h2>Initial Fran surface</h2>
        <div class="capability-row">Link to existing SKUMS workspace</div>
        <div class="capability-row">Owner membership</div>
        <div class="capability-row">Core person field definitions</div>
        <div class="capability-row">Fran member, loyalty, and beauty packs</div>
        <div class="capability-row">Planned data sources</div>
        <div class="capability-row">Internal billing boundary</div>
        <div class="capability-row">Creation audit event</div>
      </section>
    </section>
  </div>
</template>

<style scoped>
.space-stack {
  display: grid;
  gap: 1rem;
}
</style>
