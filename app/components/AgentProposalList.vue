<script setup lang="ts">
import { CheckCircle2, Clock3, FilePenLine } from '@lucide/vue'

defineProps<{
  proposals: Array<{
    id: string
    title: string
    impact: string
    status: 'draft' | 'needs_approval' | 'approved'
  }>
}>()

const statusIcon = {
  draft: FilePenLine,
  needs_approval: Clock3,
  approved: CheckCircle2
}
</script>

<template>
  <section class="proposal-list">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Agent workflow</p>
        <h2>Proposals before execution</h2>
      </div>
    </div>
    <article v-for="proposal in proposals" :key="proposal.id" class="proposal-card">
      <component :is="statusIcon[proposal.status]" :size="20" />
      <div>
        <strong>{{ proposal.title }}</strong>
        <p>{{ proposal.impact }}</p>
      </div>
      <span>{{ proposal.status.replaceAll('_', ' ') }}</span>
    </article>
  </section>
</template>
