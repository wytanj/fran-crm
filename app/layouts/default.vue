<template>
  <div class="app-shell">
    <div
      v-if="drawerOpen"
      class="sidebar-scrim"
      @click="drawerOpen = false"
    />
    <AppSidebar :open="drawerOpen" @close="drawerOpen = false" />
    <div class="main-panel">
      <AppTopbar @open-menu="drawerOpen = true" />
      <div class="main-content">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const drawerOpen = ref(false)
const route = useRoute()
const { pending, ensureReady } = useCrmAppReady()
const indicator = useLoadingIndicator()

void ensureReady()

watch(pending, (value) => {
  if (value) indicator.start()
  else indicator.finish()
}, { immediate: true })

watch(() => route.fullPath, () => {
  drawerOpen.value = false
})
</script>
