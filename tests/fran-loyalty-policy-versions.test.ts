import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildDemoFranLoyaltyPolicyBundle,
  franLoyaltyV21Rules
} from '../server/fran/loyalty/policy-versions'

const migration = readFileSync(join(process.cwd(), 'supabase/migrations/0009_fran_loyalty_policy_versions.sql'), 'utf8')

describe('Fran loyalty policy version spine', () => {
  it('keeps the default v2.1 rules executable by POS against SKUMS truth', () => {
    expect(franLoyaltyV21Rules.execution).toMatchObject({
      policyOwner: 'fran-crm',
      executor: 'fran-pos',
      pricingAuthority: 'fran-skums',
      inventoryAuthority: 'fran-skums'
    })
    expect(franLoyaltyV21Rules.tiers.map((tier) => tier.key)).toEqual(['F1', 'F2', 'F3'])
    expect(franLoyaltyV21Rules.redemption).toMatchObject({
      brackets: [
        { points: 200, rewardMinor: 600 },
        { points: 500, rewardMinor: 2000 },
        { points: 1000, rewardMinor: 5000 },
        { points: 1500, rewardMinor: 9000 },
        { points: 2500, rewardMinor: 17500 }
      ]
    })
  })

  it('builds a POS-loadable demo policy bundle', () => {
    const bundle = buildDemoFranLoyaltyPolicyBundle('11111111-1111-4111-8111-111111111111')

    expect(bundle.policyVersion.status).toBe('active')
    expect(bundle.assignment.assignmentType).toBe('workspace_default')
    expect(bundle.posContract).toMatchObject({
      executor: 'fran-pos',
      pricingAuthority: 'fran-skums',
      inventoryAuthority: 'fran-skums',
      ledgerAuthority: 'fran-crm'
    })
    expect(bundle.posContract.requiredCheckoutInputs).toContain('skumsBasketQuote')
  })

  it('creates workspace-scoped tables with RLS, active-version guard, and service grants', () => {
    expect(migration).toContain('create table public.fran_loyalty_programs')
    expect(migration).toContain('create table public.fran_loyalty_policy_versions')
    expect(migration).toContain('create table public.fran_loyalty_policy_assignments')
    expect(migration).toContain('create table public.fran_loyalty_accounts')
    expect(migration).toContain('create table public.fran_loyalty_ledger')
    expect(migration).toContain("where status = 'active'")
    expect(migration).toContain('alter table public.fran_loyalty_policy_versions enable row level security')
    expect(migration).toContain('public.crm_is_workspace_member(workspace_id)')
    expect(migration).toContain('unique (workspace_id, source_system, idempotency_key)')
    expect(migration).toContain('to service_role')
  })

  it('adds FWB point batch migration for theoretical expiry', () => {
    const batches = readFileSync(
      join(process.cwd(), 'supabase/migrations/0010_fran_loyalty_point_batches.sql'),
      'utf8'
    )
    expect(batches).toContain('fran_loyalty_point_batches')
    expect(batches).toContain('theoretical_expiry_date')
    expect(batches).toContain('earn_quarter')
    expect(batches).toContain('frozen')
  })

  it('keeps analytics cycles compatible with dynamic tier keys', () => {
    expect(migration).toContain('add column if not exists tier_counts jsonb')
  })
})
