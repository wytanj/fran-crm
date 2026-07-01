create table public.fran_loyalty_tier_evaluation_cycles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  cycle_key text not null,
  label text not null,
  evaluated_at timestamptz not null default now(),
  policy_ref text,
  member_count integer not null default 0 check (member_count >= 0),
  bronze_count integer not null default 0 check (bronze_count >= 0),
  silver_count integer not null default 0 check (silver_count >= 0),
  gold_count integer not null default 0 check (gold_count >= 0),
  upgraded_count integer not null default 0 check (upgraded_count >= 0),
  downgraded_count integer not null default 0 check (downgraded_count >= 0),
  retained_count integer not null default 0 check (retained_count >= 0),
  source text not null default 'loyalty_evaluator',
  external_ids jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, cycle_key),
  check (bronze_count + silver_count + gold_count <= member_count),
  check (upgraded_count + downgraded_count + retained_count <= member_count)
);

create index fran_loyalty_tier_cycles_workspace_eval_idx
  on public.fran_loyalty_tier_evaluation_cycles(workspace_id, evaluated_at desc);

create index fran_loyalty_tier_cycles_external_ids_idx
  on public.fran_loyalty_tier_evaluation_cycles using gin(external_ids);

alter table public.fran_loyalty_tier_evaluation_cycles enable row level security;

create policy "Members can read Fran loyalty tier evaluation cycles"
  on public.fran_loyalty_tier_evaluation_cycles
  for select using (public.crm_is_workspace_member(workspace_id));

create policy "Members can manage Fran loyalty tier evaluation cycles"
  on public.fran_loyalty_tier_evaluation_cycles
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

grant select, insert, update, delete on table
  public.fran_loyalty_tier_evaluation_cycles
to service_role;
