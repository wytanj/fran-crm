<script setup lang="ts">
import { Cable, CircleDashed } from '@lucide/vue'

defineProps<{
  items: string[]
}>()
</script>

<template>
  <section class="integration-rail">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Source data</p>
        <h2>Planned graph connectors</h2>
      </div>
      <Cable :size="20" />
    </div>
    <p class="muted-text">
      Import path only. Live POS loyalty is linked from SKUMS — see
      <NuxtLink to="/integrations">Integrations</NuxtLink>.
    </p>
    <div class="integration-list">
      <div v-for="item in items" :key="item">
        <CircleDashed :size="16" />
        <span>{{ item }}</span>
      </div>
    </div>
  </section>
</template>
