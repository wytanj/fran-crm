<script setup lang="ts">
import { Copy, Database, KeyRound } from '@lucide/vue'

const runtime = useRuntimeConfig()

const envRows = [
  { key: 'NUXT_PUBLIC_SUPABASE_URL', value: runtime.public.supabaseUrl || 'not set' },
  { key: 'NUXT_PUBLIC_SUPABASE_ANON_KEY', value: runtime.public.supabaseKey ? 'configured' : 'not set' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', value: 'server only' },
  { key: 'NUXT_PUBLIC_BILLING_MODE', value: runtime.public.billingMode }
]
</script>

<template>
  <div class="page-stack">
    <div class="intro-strip">
      <div>
        <p class="eyebrow">Self-host setup</p>
        <h2>Apply the Supabase migration, then point the Nuxt app at your project keys.</h2>
      </div>
      <Database :size="24" />
    </div>
    <section class="settings-grid">
      <article class="settings-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Environment</p>
            <h2>Current key status</h2>
          </div>
          <KeyRound :size="20" />
        </div>
        <div v-for="row in envRows" :key="row.key" class="env-row">
          <strong>{{ row.key }}</strong>
          <span>{{ row.value }}</span>
        </div>
      </article>
      <article class="settings-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Migration</p>
            <h2>Database setup</h2>
          </div>
          <Copy :size="20" />
        </div>
        <div class="code-panel">
        <pre>supabase/migrations/0001_headless_crm.sql
supabase/migrations/0002_customer_memory_foundation.sql
supabase/migrations/0003_data_api_service_role_grants.sql
supabase/migrations/0004_profile_field_packs.sql
supabase/migrations/0005_return_eligibility.sql</pre>
        </div>
        <p class="muted-text">The migrations include workspace membership, graph entities, relationships, custom field definitions, customer memory, profile packs, return eligibility, integration accounts, billing records, proposals, approvals, execution logs, and audit events.</p>
      </article>
    </section>
  </div>
</template>
