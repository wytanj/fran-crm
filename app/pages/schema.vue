<script setup lang="ts">
definePageMeta({
  middleware: 'authenticated-client'
})

const { refreshSession, startAuthListener, user } = useCrmAuth()
const { loadWorkspaces, primaryWorkspace } = useCrmWorkspaceAccess()
const workspaceId = computed(() => primaryWorkspace.value?.id)
const { data, pending, refresh } = await useCrmBootstrap(workspaceId)
const fields = computed(() => data.value?.graph.customerFields || [])
const profilePacks = computed(() => data.value?.graph.profilePacks || [])

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
    <div class="intro-strip">
      <div>
        <p class="eyebrow">Headless data contract</p>
        <h2>Start with the customer fields most commerce systems already expose, then let teams and agents add their own schema.</h2>
      </div>
      <NuxtLink class="secondary-button" to="/api-console">View API</NuxtLink>
    </div>
    <LoadingPanel
      v-if="pending"
      title="Loading schema"
      detail="Fetching field definitions and installable profile packs."
    />
    <SchemaDesigner
      v-else
      :fields="fields"
      :profile-packs="profilePacks"
      :workspace-id="workspaceId"
      @pack-installed="() => refresh()"
    />
  </div>
</template>
