<script setup lang="ts">
import { Building2, CheckCircle2 } from '@lucide/vue'
import type { WorkspaceSetupPayload } from '~/types/crm'

const { isConfigured, refreshSession, startAuthListener, user } = useCrmAuth()
const { createWorkspace, error, loadWorkspaces, pending, primaryWorkspace } = useCrmWorkspaceAccess()

const form = reactive<WorkspaceSetupPayload>({
  companyName: '',
  slug: '',
  plan: 'hosted_growth'
})
const created = ref(false)

const mustSignIn = computed(() => isConfigured.value && !user.value)

onMounted(async () => {
  startAuthListener()
  await refreshSession()

  if (user.value || !isConfigured.value) {
    await loadWorkspaces()
  }

  if (primaryWorkspace.value) {
    form.companyName = primaryWorkspace.value.name
    form.slug = primaryWorkspace.value.slug
  }
})

async function submitSetup() {
  const workspace = await createWorkspace({
    companyName: form.companyName,
    slug: form.slug,
    plan: form.plan
  })

  created.value = true

  if (workspace.id) {
    await navigateTo('/graph')
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

        <div v-if="mustSignIn" class="notice-bar">
          Sign in first so the company can be assigned to your user as owner.
        </div>

        <label>
          <span>Company name</span>
          <input v-model="form.companyName" type="text" placeholder="Acme Retail" required />
        </label>
        <label>
          <span>Workspace slug</span>
          <input v-model="form.slug" type="text" placeholder="acme-retail" pattern="[a-z0-9]+(-[a-z0-9]+)*" />
        </label>
        <label>
          <span>Workspace mode</span>
          <select v-model="form.plan">
            <option value="hosted_growth">Fran Workspace</option>
            <option value="hosted_scale">Fran Scale</option>
          </select>
        </label>

        <button class="primary-button" type="submit" :disabled="pending || mustSignIn">
          <CheckCircle2 :size="17" />
          <span>{{ pending ? 'Creating workspace' : 'Create company workspace' }}</span>
        </button>

        <NuxtLink v-if="mustSignIn" class="secondary-button" to="/login">Sign in</NuxtLink>
        <p v-if="created" class="notice-text">Workspace created.</p>
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
