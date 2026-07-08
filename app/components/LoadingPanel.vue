<script setup lang="ts">
import { LoaderCircle } from '@lucide/vue'

withDefaults(defineProps<{
  title: string
  detail?: string
  compact?: boolean
}>(), {
  detail: '',
  compact: false
})
</script>

<template>
  <section
    class="loading-panel"
    :class="{ 'loading-panel-compact': compact }"
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <LoaderCircle class="loading-spinner" :size="21" aria-hidden="true" />
    <div>
      <strong>{{ title }}</strong>
      <p v-if="detail">{{ detail }}</p>
    </div>
  </section>
</template>
