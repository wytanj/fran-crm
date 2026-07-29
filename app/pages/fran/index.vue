<script setup lang="ts">
import { BadgeCheck, BarChart3, Gift, RefreshCcw, ScanLine, ShieldCheck } from '@lucide/vue'

definePageMeta({
  middleware: 'authenticated-client'
})

const posRoutes = [
  {
    method: 'POST',
    path: '/fran/pos/member/resolve',
    purpose: 'Resolve a phone, member number, QR, barcode, or external reference to a person id.'
  },
  {
    method: 'POST',
    path: '/fran/pos/counter-session',
    purpose: 'Build the counter projection for identity, loyalty, rewards, and safety context.'
  },
  {
    method: 'GET',
    path: '/api/fran/analytics',
    purpose: 'Read tier mix, sign-up trends, and cycle movement for one workspace.'
  },
  {
    method: 'GET',
    path: '/api/fran/loyalty/policy-versions/active',
    purpose: 'Load the policy bundle POS executes against a SKUMS basket quote.'
  },
  {
    method: 'GET',
    path: '/api/fran/loyalty/policy-versions',
    purpose: 'List draft, testing, approved, active, and retired versions.'
  },
  {
    method: 'POST',
    path: '/api/fran/loyalty/policy-versions',
    purpose: 'Create a draft, testing, or approved policy version.'
  },
  {
    method: 'POST',
    path: '/api/fran/loyalty/policy-versions/[version_id]/publish',
    purpose: 'Publish a version as its program default.'
  },
  {
    method: 'POST',
    path: '/api/fran/loyalty/assignments',
    purpose: 'Assign a version to a workspace, store, register, member, cohort, or experiment.'
  },
  {
    method: 'POST',
    path: '/fran/pos/basket/preview',
    purpose: 'Placeholder. Evaluation runs locally from the policy bundle and SKUMS quote.'
  },
  {
    method: 'POST',
    path: '/fran/pos/rewards/quote',
    purpose: 'Planned. Validate redemption before payment confirmation.'
  },
  {
    method: 'POST',
    path: '/fran/pos/rewards/commit',
    purpose: 'Planned. Idempotent points commit after payment.'
  },
  {
    method: 'POST',
    path: '/fran/pos/rewards/reverse',
    purpose: 'Planned. Idempotent reversal for voids and reward rollback.'
  }
]

const guardrails = [
  { icon: ScanLine, label: 'POS reads decision routes, never raw graph tables.' },
  { icon: ShieldCheck, label: 'Restricted fields stay filtered by backend projection.' },
  { icon: RefreshCcw, label: 'Loading a policy never mutates points. Commit and reverse are idempotent.' },
  { icon: BadgeCheck, label: 'POS executes assigned versions against SKUMS price and inventory truth.' },
  { icon: BarChart3, label: 'Analytics stay aggregate and workspace-scoped.' }
]
</script>

<template>
  <div class="page-stack">
    <div class="intro-strip">
      <div>
        <p class="eyebrow">Fran POS</p>
        <h2>Counter contracts</h2>
        <p>Member identity, loyalty policy, and reward decisions the register calls at the counter.</p>
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
          <p class="eyebrow">Guardrails</p>
          <h2>Operational boundaries</h2>
        </div>
      </div>
      <article v-for="guardrail in guardrails" :key="guardrail.label" class="capability-row">
        <component :is="guardrail.icon" :size="17" />
        <span>{{ guardrail.label }}</span>
      </article>
    </section>
  </div>
</template>
