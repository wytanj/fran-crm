<script setup lang="ts">
import type { CrmMetric } from '~/types/crm'

defineProps<{
  metrics: CrmMetric[]
}>()
</script>

<template>
  <section class="metric-grid" aria-label="CRM metrics">
    <article v-for="metric in metrics" :key="metric.label" class="metric-card">
      <span>{{ metric.label }}</span>
      <strong>{{ metric.value }}</strong>
      <p>{{ metric.detail }}</p>
    </article>
  </section>
</template>
