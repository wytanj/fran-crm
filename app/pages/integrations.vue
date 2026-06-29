<script setup lang="ts">
import { CheckCircle2, Clock3, PlugZap } from '@lucide/vue'

definePageMeta({
  middleware: 'authenticated-client'
})

const connectors = [
  { name: 'Shopify', status: 'planned', scope: 'Customers, orders, products, consent, tags' },
  { name: 'POS', status: 'planned', scope: 'Receipts, stores, cashiers, loyalty identifiers' },
  { name: 'Support desk', status: 'planned', scope: 'Tickets, messages, sentiment, resolution outcomes' },
  { name: 'Email/SMS', status: 'planned', scope: 'Consent, campaigns, clicks, unsubscribes' },
  { name: 'CSV import', status: 'available', scope: 'Manual staging for people, companies, orders, and attributes' }
]
</script>

<template>
  <div class="page-stack">
    <div class="intro-strip">
      <div>
        <p class="eyebrow">Integration boundary</p>
        <h2>Fran CRM accepts source events and connector imports without giving POS direct access to raw graph tables.</h2>
      </div>
      <PlugZap :size="24" />
    </div>
    <section class="connector-table">
      <article v-for="connector in connectors" :key="connector.name" class="connector-row">
        <component :is="connector.status === 'available' ? CheckCircle2 : Clock3" :size="20" />
        <div>
          <strong>{{ connector.name }}</strong>
          <p>{{ connector.scope }}</p>
        </div>
        <span>{{ connector.status }}</span>
      </article>
    </section>
  </div>
</template>
