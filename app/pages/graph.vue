<script setup lang="ts">
definePageMeta({
  middleware: 'authenticated-client'
})

const { refreshSession, startAuthListener, user } = useCrmAuth()
const { loadWorkspaces, primaryWorkspace, requiresSetup } = useCrmWorkspaceAccess()
const workspaceId = computed(() => primaryWorkspace.value?.id)
const { data, pending, refresh } = await useCrmBootstrap(workspaceId)

const graph = computed(() => data.value?.graph)

onMounted(async () => {
  startAuthListener()
  await refreshSession()

  if (user.value) {
    await loadWorkspaces()
    await refresh()
  }
})
</script>

<template>
  <div class="page-stack">
    <div v-if="pending" class="loading-panel">Loading CRM graph...</div>
    <template v-else-if="graph">
      <div v-if="requiresSetup" class="notice-bar">
        Create your company workspace before loading hosted CRM data.
        <NuxtLink to="/setup">Set up company</NuxtLink>
      </div>
      <div v-else-if="data?.mode === 'demo'" class="notice-bar">
        Running with demo data. Add Supabase keys to use your own open CRM database.
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
  </div>
</template>
