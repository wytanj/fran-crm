-- L-base: FWB point batches (theoretical expiry stored once at earn time)
-- Run after 0009_fran_loyalty_policy_versions.sql

create table if not exists public.fran_loyalty_point_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  program_id uuid not null references public.fran_loyalty_programs(id) on delete cascade,
  account_id uuid not null references public.fran_loyalty_accounts(id) on delete cascade,
  ledger_entry_id uuid references public.fran_loyalty_ledger(id) on delete set null,
  points numeric(14,2) not null check (points > 0),
  points_remaining numeric(14,2) not null check (points_remaining >= 0),
  earn_date date not null,
  earn_quarter text not null check (earn_quarter in ('Q1', 'Q2', 'Q3', 'Q4')),
  theoretical_expiry_date date not null,
  frozen boolean not null default false,
  source text not null default 'pos_sale',
  sale_id text,
  policy_version_id uuid references public.fran_loyalty_policy_versions(id) on delete set null,
  source_system text not null default 'fran-pos',
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, source_system, idempotency_key),
  check (points_remaining <= points)
);

create index if not exists fran_loyalty_point_batches_account_expiry_idx
  on public.fran_loyalty_point_batches(workspace_id, account_id, theoretical_expiry_date);

create index if not exists fran_loyalty_point_batches_expiry_active_idx
  on public.fran_loyalty_point_batches(workspace_id, theoretical_expiry_date)
  where points_remaining > 0 and frozen = false;

alter table public.fran_loyalty_point_batches enable row level security;

create policy "Members can manage Fran loyalty point batches"
  on public.fran_loyalty_point_batches
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

grant select, insert, update, delete on table public.fran_loyalty_point_batches to service_role;

comment on table public.fran_loyalty_point_batches is
  'FWB point batches: earn_date, earn_quarter, theoretical_expiry_date immutable; frozen while F2/F3.';
