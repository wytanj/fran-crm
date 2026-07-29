<script setup lang="ts">
definePageMeta({
  middleware: 'authenticated-client'
})

const endpoints = [
  { method: 'GET', path: '/api/crm/bootstrap', purpose: 'Load the workspace graph, fields, proposals, and integration state.' },
  { method: 'GET', path: '/api/fran/analytics', purpose: 'Load the tier snapshot, sign-up trends, and cycle movement.' },
  { method: 'GET', path: '/api/graph/search?q=ava', purpose: 'Search labels, tags, and normalized entity attributes.' },
  { method: 'GET', path: '/api/profile-packs', purpose: 'List installable and installed profile packs.' },
  { method: 'GET', path: '/api/profile-packs/fran_beauty_profile', purpose: 'Inspect one pack definition and its fields.' },
  { method: 'POST', path: '/api/profile-packs/fran_beauty_profile/install', purpose: 'Install a pack idempotently.' },
  { method: 'POST', path: '/api/fran/pos/member/resolve', purpose: 'Resolve a POS member identifier without exposing CRM tables.' },
  { method: 'POST', path: '/api/fran/pos/counter-session', purpose: 'Create the POS-safe counter projection.' },
  { method: 'GET', path: '/api/v1/people/person_001/counter-profile', purpose: 'Return POS-visible fields and advisory warnings only.' },
  { method: 'PATCH', path: '/api/v1/people/person_001/profile-fields', purpose: 'Update pack-scoped fields and write profile facts.' },
  { method: 'POST', path: '/api/schema/fields', purpose: 'Add a custom field to a workspace entity type.' },
  { method: 'POST', path: '/api/billing/checkout', purpose: 'Record the internal billing boundary.' }
]

const samplePayload = {
  workspaceId: 'workspace uuid',
  packKey: 'fran_beauty_profile',
  fields: {
    skin_type: 'Combination',
    skin_concerns: ['Acne', 'Pigmentation'],
    reported_sensitivities: ['retinol', 'fragrance']
  },
  sourceSystem: 'crm_ui'
}
</script>

<template>
  <div class="page-stack">
    <div class="intro-strip">
      <div>
        <p class="eyebrow">API layer</p>
        <h2>One spine, many clients</h2>
        <p>This UI is just one caller. Integrations, agents, and MCP servers use the same routes.</p>
      </div>
    </div>
    <section class="api-grid">
      <article v-for="endpoint in endpoints" :key="endpoint.path" class="endpoint-card">
        <span>{{ endpoint.method }}</span>
        <strong>{{ endpoint.path }}</strong>
        <p>{{ endpoint.purpose }}</p>
      </article>
      <article class="code-card">
        <strong>Profile field update payload</strong>
        <pre>{{ JSON.stringify(samplePayload, null, 2) }}</pre>
      </article>
    </section>
  </div>
</template>
