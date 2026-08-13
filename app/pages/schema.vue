<script setup lang="ts">
definePageMeta({
  middleware: 'authenticated-client'
})

const { primaryWorkspace } = useCrmWorkspaceAccess()
const workspaceId = computed(() => primaryWorkspace.value?.id)
const { data, pending, refresh } = useCrmBootstrap()
const fields = computed(() => data.value?.graph.customerFields || [])
const profilePacks = computed(() => data.value?.graph.profilePacks || [])
</script>

<template>
  <div class="page-stack">
    <div class="intro-strip">
      <div>
        <p class="eyebrow">Data contract</p>
        <h2>Customer schema</h2>
        <p>Start with the fields commerce systems already expose, then let teams and agents extend them.</p>
      </div>
      <NuxtLink class="secondary-button" to="/api-console">View API</NuxtLink>
    </div>
    <LoadingPanel v-if="pending" title="Loading schema" detail="Checking your workspace, then field packs." />
    <SchemaDesigner
      v-else
      :fields="fields"
      :profile-packs="profilePacks"
      :workspace-id="workspaceId"
      @pack-installed="() => refresh()"
    />
  </div>
</template>
