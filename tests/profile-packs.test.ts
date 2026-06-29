import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const migration = readFileSync(join(process.cwd(), 'supabase/migrations/0004_profile_field_packs.sql'), 'utf8')

describe('profile pack foundation', () => {
  it('adds a workspace-scoped profile pack registry with RLS', () => {
    expect(migration).toContain('create table public.crm_profile_packs')
    expect(migration).toContain('workspace_id uuid not null references public.crm_workspaces(id)')
    expect(migration).toContain('alter table public.crm_profile_packs enable row level security')
    expect(migration).toContain('grant select, insert, update, delete on table')
  })

  it('extends field definitions with pack, projection, and sensitivity metadata', () => {
    for (const column of [
      'pack_key text',
      'sensitivity_level text not null default',
      'pos_visible boolean not null default false',
      'cashier_editable boolean not null default false',
      'marketing_usable boolean not null default false',
      'ui_contexts text[] not null default',
      'metadata jsonb not null default'
    ]) {
      expect(migration).toContain(column)
    }
  })

  it('uses pack-aware uniqueness without adding a separate current-value table', () => {
    expect(migration).toContain('crm_field_definitions_base_key_idx')
    expect(migration).toContain('crm_field_definitions_pack_key_idx')
    expect(migration).toContain('where pack_key is not null')
    expect(migration).not.toContain('crm_profile_field_values')
  })
})
