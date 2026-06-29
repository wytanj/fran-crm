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
        <p class="eyebrow">Hosted integration layer</p>
        <h2>Connectors planned for paid workspaces</h2>
      </div>
      <Cable :size="20" />
    </div>
    <div class="integration-list">
      <div v-for="item in items" :key="item">
        <CircleDashed :size="16" />
        <span>{{ item }}</span>
      </div>
    </div>
  </section>
</template>
