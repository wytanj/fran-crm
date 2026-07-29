<script setup lang="ts">
import { Building2, CheckCircle2, LoaderCircle, UserRound } from '@lucide/vue'
import type { WorkspaceSetupPayload } from '~/types/crm'
import type { PendingCrmInvite } from '~/composables/useCrmWorkspaceInvites'

definePageMeta({
  middleware: 'authenticated-client'
})

const { isConfigured, refreshSession, signInWithGoogle, startAuthListener, user } = useCrmAuth()
const { createWorkspace, error, loadWorkspaces, pending, primaryWorkspace } = useCrmWorkspaceAccess()
const { acceptInvite, listMyPending } = useCrmWorkspaceInvites()

const form = reactive<WorkspaceSetupPayload>({
  companyName: '',
  slug: '',
  plan: 'hosted_growth'
})
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

const mustSignIn = computed(() => isConfigured.value && !user.value)
const submitLabel = computed(() => {
  if (primaryWorkspace.value) {
    return 'Open company workspace'
  }

  return creatingWorkspace.value ? 'Creating workspace' : 'Create company workspace'
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
    showCreateForm.value = pendingInvites.value.length === 0
  } catch {
    showCreateForm.value = true
  } finally {
    loadingInvites.value = false
  }
}

onMounted(async () => {
  startAuthListener()
  await refreshSession()

  if (user.value || !isConfigured.value) {
    await loadWorkspaces()
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
    await loadWorkspaces()
    await navigateTo('/graph')
  } catch (e) {
    joinError.value = e instanceof Error ? e.message : 'Failed to join workspace'
  } finally {
    joining.value = false
  }
}

async function submitSetup() {
  if (primaryWorkspace.value?.id) {
    await navigateTo('/graph')
    return
  }

  creatingWorkspace.value = true

  try {
    const workspace = await createWorkspace({
      companyName: form.companyName,
      slug: form.slug,
      plan: form.plan
    })

    created.value = true

    if (workspace.id) {
      await navigateTo('/graph')
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
        <h2 v-else>Create your company workspace</h2>
        <p v-if="pendingInvites.length && !primaryWorkspace">
          Accept an invite to Fran CRM. Prefer this over creating a second workspace.
        </p>
        <p v-else>Required before adding users, agents, or integrations (founders only after seed).</p>
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
              v-if="!showCreateForm"
              type="button"
              class="secondary-button"
              @click="showCreateForm = true"
            >
              Create a new workspace instead
            </button>
          </div>

          <form v-if="showCreateForm || !pendingInvites.length" class="space-stack" @submit.prevent="submitSetup">
            <p v-if="pendingInvites.length" class="muted-text">
              Creating a new workspace starts a separate CRM tenant. Prefer joining if you were invited.
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
          <button class="primary-button" type="button" @click="navigateTo('/graph')">
            Open company workspace
          </button>
        </div>
      </div>

      <section class="settings-panel setup-checklist">
        <p class="eyebrow">Created on setup</p>
        <h2>Initial Fran surface</h2>
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
