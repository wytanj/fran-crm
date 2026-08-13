<script setup lang="ts">
definePageMeta({
  middleware: 'authenticated-client'
})

const { primaryWorkspace, requiresSetup } = useCrmWorkspaceAccess()
const workspaceId = computed(() => primaryWorkspace.value?.id)
const { data, pending } = useCrmBootstrap()
const graph = computed(() => data.value?.graph)
</script>

<template>
  <div class="page-stack">
    <LoadingPanel v-if="pending" title="Loading CRM graph" detail="Checking your workspace, then the identity graph." />
    <template v-else-if="requiresSetup">
      <div class="notice-bar">
        Create your company workspace to load hosted data.
        <NuxtLink to="/setup">Set up company</NuxtLink>
      </div>
    </template>
    <template v-else-if="graph">
      <div v-if="data?.mode === 'demo'" class="notice-bar">
        Running on demo data. Add Supabase keys to use your own database.
      </div>
      <div class="notice-bar">
        Looking for a simple member list?
        <NuxtLink to="/customers">Open Customers</NuxtLink>
        — this page is the identity graph (links, packs, proposals).
      </div>
      <MetricStrip :metrics="graph.metrics" />
      <GraphWorkspace
        :entities="graph.entities"
        :relationships="graph.relationships"
        :profile-packs="graph.profilePacks"
        :workspace-id="workspaceId"
      />
      <div class="two-column">
        <AgentProposalList :proposals="graph.proposals" />
        <IntegrationRail :items="graph.integrationBacklog" />
      </div>
    </template>
    <LoadingPanel v-else title="Loading CRM graph" />
  </div>
</template>
