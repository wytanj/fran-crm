<script setup lang="ts">
const { data } = await useCrmBootstrap()
const proposals = computed(() => data.value?.graph.proposals || [])

const capabilities = [
  'Identity resolution with approval before merging',
  'Schema suggestions from import batches and agent context',
  'Audience creation with audit logs before export',
  'B2B account promotion when repeat orders look like a company relationship',
  'Execution logs for every approved agent action'
]
</script>

<template>
  <div class="page-stack">
    <div class="intro-strip">
      <div>
        <p class="eyebrow">Agentic CRM</p>
        <h2>Agents can propose, but the CRM keeps approvals, execution logs, and provenance in the core data spine.</h2>
      </div>
    </div>
    <div class="two-column">
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
