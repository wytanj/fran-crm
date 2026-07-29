<script setup lang="ts">
definePageMeta({
  middleware: 'authenticated-client'
})

const { data, pending } = await useCrmBootstrap()
const proposals = computed(() => data.value?.graph.proposals || [])

const capabilities = [
  'Identity resolution, approved before any merge',
  'Schema suggestions drawn from import batches',
  'Audience creation, audit-logged before export',
  'B2B account promotion from repeat order patterns',
  'Execution logs for every approved action'
]
</script>

<template>
  <div class="page-stack">
    <div class="intro-strip">
      <div>
        <p class="eyebrow">Agentic CRM</p>
        <h2>Agents propose, the CRM decides</h2>
        <p>Approvals, execution logs, and provenance stay in the core data spine.</p>
      </div>
    </div>
    <LoadingPanel v-if="pending" title="Loading agent workspace" />
    <div v-else class="two-column">
      <AgentProposalList :proposals="proposals" />
      <section class="capability-list">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Guardrails</p>
            <h2>Default operating model</h2>
          </div>
        </div>
        <div v-for="capability in capabilities" :key="capability" class="capability-row">{{ capability }}</div>
      </section>
    </div>
  </div>
</template>
