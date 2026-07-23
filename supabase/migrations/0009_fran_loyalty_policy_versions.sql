create table public.fran_loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  description text,
  status text not null default 'active' check (status in ('draft', 'active', 'retired')),
  default_currency text not null default 'SGD' check (default_currency ~ '^[A-Z]{3}$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, key)
);

create table public.fran_loyalty_policy_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  program_id uuid not null references public.fran_loyalty_programs(id) on delete cascade,
  version_key text not null check (version_key ~ '^[a-z0-9][a-z0-9_.-]*$'),
  version_label text not null,
  status text not null default 'draft' check (status in ('draft', 'testing', 'approved', 'active', 'retired')),
  effective_from timestamptz,
  effective_to timestamptz,
  rules jsonb not null check (jsonb_typeof(rules) = 'object'),
  source_document_ref text,
  source_hash text,
  change_note text,
  created_by uuid references auth.users(id),
  published_by uuid references auth.users(id),
  published_at timestamptz,
  retired_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, program_id, version_key),
  check (effective_to is null or effective_from is null or effective_to > effective_from)
);

create unique index fran_loyalty_policy_versions_one_active_idx
  on public.fran_loyalty_policy_versions(workspace_id, program_id)
  where status = 'active';

create index fran_loyalty_policy_versions_workspace_status_idx
  on public.fran_loyalty_policy_versions(workspace_id, status, created_at desc);

create index fran_loyalty_policy_versions_rules_idx
  on public.fran_loyalty_policy_versions using gin(rules);

create table public.fran_loyalty_policy_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  program_id uuid not null references public.fran_loyalty_programs(id) on delete cascade,
  policy_version_id uuid not null references public.fran_loyalty_policy_versions(id) on delete cascade,
  assignment_key text not null check (assignment_key ~ '^[a-z0-9][a-z0-9_.:-]*$'),
  assignment_type text not null check (assignment_type in ('workspace_default', 'store', 'register', 'member', 'cohort', 'experiment')),
  target_ref text,
  priority integer not null default 100,
  allocation_percent numeric(5,2) not null default 100 check (allocation_percent >= 0 and allocation_percent <= 100),
  status text not null default 'active' check (status in ('active', 'paused', 'retired')),
  starts_at timestamptz,
  ends_at timestamptz,
  assignment_rules jsonb not null default '{}'::jsonb check (jsonb_typeof(assignment_rules) = 'object'),
  external_ids jsonb not null default '{}'::jsonb check (jsonb_typeof(external_ids) = 'object'),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, assignment_key),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index fran_loyalty_policy_assignments_target_idx
  on public.fran_loyalty_policy_assignments(workspace_id, assignment_type, target_ref, priority);

create index fran_loyalty_policy_assignments_version_idx
  on public.fran_loyalty_policy_assignments(policy_version_id);

create table public.fran_loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  program_id uuid not null references public.fran_loyalty_programs(id) on delete cascade,
  person_entity_id uuid references public.crm_entities(id) on delete set null,
  member_ref text,
  current_tier_key text,
  points_balance numeric(14,2) not null default 0,
  lifetime_points_earned numeric(14,2) not null default 0,
  lifetime_points_redeemed numeric(14,2) not null default 0,
  spend_qualification jsonb not null default '{}'::jsonb check (jsonb_typeof(spend_qualification) = 'object'),
  active_policy_version_id uuid references public.fran_loyalty_policy_versions(id) on delete set null,
  source text not null default 'fran_crm',
  external_ids jsonb not null default '{}'::jsonb check (jsonb_typeof(external_ids) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, program_id, person_entity_id),
  check (points_balance >= 0),
  check (lifetime_points_earned >= 0),
  check (lifetime_points_redeemed >= 0)
);

create index fran_loyalty_accounts_workspace_member_idx
  on public.fran_loyalty_accounts(workspace_id, member_ref);

create index fran_loyalty_accounts_external_ids_idx
  on public.fran_loyalty_accounts using gin(external_ids);

create table public.fran_loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  program_id uuid not null references public.fran_loyalty_programs(id) on delete cascade,
  account_id uuid references public.fran_loyalty_accounts(id) on delete set null,
  policy_version_id uuid references public.fran_loyalty_policy_versions(id) on delete set null,
  source_event_id uuid references public.crm_events(id) on delete set null,
  entry_type text not null check (entry_type in ('earn', 'redeem', 'expire', 'adjust', 'reverse', 'tier_adjust')),
  points_delta numeric(14,2) not null,
  balance_after numeric(14,2),
  occurred_at timestamptz not null default now(),
  source_system text not null default 'fran-pos',
  idempotency_key text not null,
  evaluation_trace jsonb not null default '{}'::jsonb check (jsonb_typeof(evaluation_trace) = 'object'),
  external_ids jsonb not null default '{}'::jsonb check (jsonb_typeof(external_ids) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (workspace_id, source_system, idempotency_key)
);

create index fran_loyalty_ledger_account_time_idx
  on public.fran_loyalty_ledger(workspace_id, account_id, occurred_at desc);

create index fran_loyalty_ledger_policy_idx
  on public.fran_loyalty_ledger(policy_version_id);

create index fran_loyalty_ledger_evaluation_trace_idx
  on public.fran_loyalty_ledger using gin(evaluation_trace);

alter table if exists public.fran_loyalty_tier_evaluation_cycles
  add column if not exists tier_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(tier_counts) = 'object');

alter table public.fran_loyalty_programs enable row level security;
alter table public.fran_loyalty_policy_versions enable row level security;
alter table public.fran_loyalty_policy_assignments enable row level security;
alter table public.fran_loyalty_accounts enable row level security;
alter table public.fran_loyalty_ledger enable row level security;

create policy "Members can manage Fran loyalty programs"
  on public.fran_loyalty_programs
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

create policy "Members can manage Fran loyalty policy versions"
  on public.fran_loyalty_policy_versions
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

create policy "Members can manage Fran loyalty policy assignments"
  on public.fran_loyalty_policy_assignments
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

create policy "Members can manage Fran loyalty accounts"
  on public.fran_loyalty_accounts
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

create policy "Members can manage Fran loyalty ledger"
  on public.fran_loyalty_ledger
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

grant select, insert, update, delete on table
  public.fran_loyalty_programs,
  public.fran_loyalty_policy_versions,
  public.fran_loyalty_policy_assignments,
  public.fran_loyalty_accounts,
  public.fran_loyalty_ledger
to service_role;
