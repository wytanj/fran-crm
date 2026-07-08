<script setup lang="ts">
import { Building2, CheckCircle2, LoaderCircle, UserRound } from '@lucide/vue'
import type { WorkspaceSetupPayload } from '~/types/crm'

definePageMeta({
  middleware: 'authenticated-client'
})

const { isConfigured, refreshSession, signInWithGoogle, startAuthListener, user } = useCrmAuth()
const { createWorkspace, error, loadWorkspaces, pending, primaryWorkspace } = useCrmWorkspaceAccess()

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
    return 'Refreshing workspace membership and owner access.'
  }

  if (creatingWorkspace.value) {
    return 'Writing workspace ownership and installing the default Fran CRM surface.'
  }

  return 'Checking whether your company workspace already exists.'
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
  }
})

watch(user, fillSuggestedCompany)

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
        <h2>Set up the master company workspace before adding CRM users, agents, or integrations.</h2>
      </div>
      <Building2 :size="24" />
    </div>

    <section class="setup-grid">
      <form class="settings-panel setup-form" @submit.prevent="submitSetup">
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
          v-else-if="pending || creatingWorkspace"
          :title="workspaceLoadingTitle"
          :detail="workspaceLoadingDetail"
          compact
        />

        <div v-if="mustSignIn" class="notice-bar">
          Sign in first so the company can be assigned to your user as owner.
          <div class="setup-auth-actions">
            <button class="primary-button" type="button" :disabled="googlePending || !isConfigured" @click="continueWithGoogle">
              <LoaderCircle v-if="googlePending" class="button-spinner" :size="17" aria-hidden="true" />
              <UserRound v-else :size="17" />
              <span>{{ googlePending ? 'Opening Google' : 'Continue with Google' }}</span>
            </button>
            <NuxtLink class="secondary-button" to="/login">Use email link</NuxtLink>
          </div>
        </div>

        <label>
          <span>Company name</span>
          <input v-model="form.companyName" type="text" placeholder="Acme Retail" required />
        </label>
        <label>
          <span>Workspace slug</span>
          <input v-model="form.slug" type="text" placeholder="acme-retail" pattern="[a-z0-9]+(-[a-z0-9]+)*" @input="handleSlugInput" />
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

      <section class="settings-panel setup-checklist">
        <p class="eyebrow">Exposed after setup</p>
        <h2>Initial Fran surface</h2>
        <div class="capability-row">Owner membership in workspace members</div>
        <div class="capability-row">Core person fields in field definitions</div>
        <div class="capability-row">Fran member, loyalty, and beauty packs installed by default</div>
        <div class="capability-row">Planned source rows in data sources</div>
        <div class="capability-row">Internal subscription and billing boundary</div>
        <div class="capability-row">Workspace creation audit event</div>
      </section>
    </section>
  </div>
</template>
