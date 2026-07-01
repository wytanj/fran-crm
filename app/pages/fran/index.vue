<script setup lang="ts">
import { BadgeCheck, BarChart3, Gift, RefreshCcw, ScanLine, ShieldCheck } from '@lucide/vue'

definePageMeta({
  middleware: 'authenticated-client'
})

const posRoutes = [
  {
    method: 'POST',
    path: '/fran/pos/member/resolve',
    purpose: 'Resolve phone, member number, QR, barcode, or external references to a Fran person id.'
  },
  {
    method: 'POST',
    path: '/fran/pos/counter-session',
    purpose: 'Create the compact POS projection for member identity, loyalty, rewards, and safe beauty context.'
  },
  {
    method: 'GET',
    path: '/api/fran/analytics',
    purpose: 'Read aggregate tier mix, sign-up trends, and evaluation-cycle movement for one workspace.'
  },
  {
    method: 'POST',
    path: '/fran/pos/basket/preview',
    purpose: 'Planned evaluator for projected earn, tier progress, and reward eligibility without mutating points.'
  },
  {
    method: 'POST',
    path: '/fran/pos/rewards/quote',
    purpose: 'Planned redemption validation before payment confirmation.'
  },
  {
    method: 'POST',
    path: '/fran/pos/rewards/commit',
    purpose: 'Planned idempotent post-payment commit for points redemption.'
  },
  {
    method: 'POST',
    path: '/fran/pos/rewards/reverse',
    purpose: 'Planned idempotent reversal for voids and reward rollback.'
  }
]

const guardrails = [
  { icon: ScanLine, label: 'POS reads compact decision routes, not raw graph tables.' },
  { icon: ShieldCheck, label: 'Restricted fields stay filtered by backend projection logic.' },
  { icon: RefreshCcw, label: 'Preview never mutates points; commit and reverse are idempotent.' },
  { icon: BadgeCheck, label: 'Published loyalty policies decide tier progress and reward eligibility.' },
  { icon: BarChart3, label: 'Analytics stay aggregate and workspace-scoped.' }
]
</script>

<template>
  <div class="page-stack">
    <div class="intro-strip">
      <div>
        <p class="eyebrow">Fran CRM</p>
        <h2>Member identity, counter projection, loyalty policy, and reward decisions for Fran POS.</h2>
      </div>
      <Gift :size="24" />
    </div>

    <section class="api-grid">
      <article v-for="route in posRoutes" :key="route.path" class="endpoint-card">
        <span>{{ route.method }}</span>
        <strong>{{ route.path }}</strong>
        <p>{{ route.purpose }}</p>
      </article>
    </section>

    <section class="capability-list">
      <div class="section-heading compact-heading">
        <div>
          <p class="eyebrow">POS guardrails</p>
          <h2>Operational boundaries</h2>
        </div>
      </div>
      <article v-for="guardrail in guardrails" :key="guardrail.label" class="capability-row">
        <component :is="guardrail.icon" :size="18" />
        <span>{{ guardrail.label }}</span>
      </article>
    </section>
  </div>
</template>
