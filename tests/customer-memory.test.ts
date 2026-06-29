import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { demoCustomerProfile, demoCustomerTimeline } from '../server/utils/demo-crm'

const migration = readFileSync(join(process.cwd(), 'supabase/migrations/0002_customer_memory_foundation.sql'), 'utf8')

describe('customer memory foundation', () => {
  it('adds the CRM Phase 1 customer-memory tables', () => {
    for (const table of [
      'crm_events',
      'crm_external_links',
      'crm_customer_facts',
      'crm_customer_profiles',
      'crm_segment_memberships',
      'crm_consent_records',
      'crm_metric_definitions'
    ]) {
      expect(migration).toContain(`public.${table}`)
      expect(migration).toContain(`alter table public.${table} enable row level security`)
    }
  })

  it('keeps source event writes idempotent', () => {
    expect(migration).toContain('unique (workspace_id, source_system, idempotency_key)')
    expect(migration).toContain('unique (workspace_id, source_system, event_id)')
  })

  it('ships demo read models for v1 people endpoints', () => {
    expect(demoCustomerProfile).toMatchObject({
      id: 'person_001',
      consent: expect.any(Object),
      activityProfile: expect.any(Object),
      valueProfile: expect.any(Object),
      sensitivityLevel: 'internal'
    })
    expect(demoCustomerTimeline.length).toBeGreaterThan(0)
  })
})
