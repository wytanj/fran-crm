create table public.crm_commerce_orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  person_id uuid references public.crm_entities(id) on delete set null,
  source_system text not null,
  external_order_ref text not null,
  order_number text,
  receipt_number text,
  email_at_purchase text,
  occurred_at timestamptz not null,
  status text not null,
  currency text not null,
  subtotal numeric,
  discount_total numeric,
  tax_total numeric,
  total numeric,
  raw_event_id uuid references public.crm_events(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, source_system, external_order_ref)
);

create table public.crm_commerce_order_lines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  order_id uuid not null references public.crm_commerce_orders(id) on delete cascade,
  external_line_ref text,
  product_identity_id text,
  product_ref jsonb not null default '{}'::jsonb,
  sku text,
  product_name text,
  quantity_purchased numeric not null check (quantity_purchased > 0),
  quantity_already_returned numeric not null default 0 check (quantity_already_returned >= 0),
  unit_price numeric,
  final_line_total numeric,
  returnable_until timestamptz,
  policy_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index crm_commerce_order_lines_external_ref_idx
  on public.crm_commerce_order_lines(workspace_id, order_id, external_line_ref)
  where external_line_ref is not null;

create table public.crm_return_policies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  version integer not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  label text,
  effective_from timestamptz not null,
  effective_until timestamptz,
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (workspace_id, version)
);

create table public.crm_return_eligibility_checks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  request_hash text not null,
  email_hint text not null,
  order_date_hint date,
  receipt_or_order_hint text,
  product_ref jsonb not null,
  sku text,
  requested_qty numeric not null check (requested_qty > 0),
  requested_action text not null check (requested_action in ('refund', 'exchange', 'store_credit', 'either')),
  matched_person_id uuid references public.crm_entities(id) on delete set null,
  matched_order_id uuid references public.crm_commerce_orders(id) on delete set null,
  matched_order_line_id uuid references public.crm_commerce_order_lines(id) on delete set null,
  decision text not null check (decision in ('eligible', 'exchange_only', 'store_credit_only', 'manager_review', 'ineligible', 'not_found', 'insufficient_context')),
  allowed_actions jsonb not null default '[]'::jsonb,
  reason_codes text[] not null default '{}',
  manager_required boolean not null default false,
  policy_version_id uuid references public.crm_return_policies(id) on delete set null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (workspace_id, request_hash)
);

create table public.crm_return_authorizations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  eligibility_check_id uuid not null references public.crm_return_eligibility_checks(id) on delete cascade,
  matched_order_line_id uuid references public.crm_commerce_order_lines(id) on delete set null,
  product_ref jsonb not null,
  approved_qty numeric not null check (approved_qty > 0),
  allowed_actions jsonb not null default '[]'::jsonb,
  status text not null default 'issued' check (status in ('issued', 'consumed', 'expired', 'voided')),
  valid_until timestamptz not null,
  consumed_by_source_system text,
  consumed_by_return_ref text,
  consumed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.crm_commerce_return_facts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
  source_system text not null,
  external_return_ref text not null,
  external_line_ref text not null,
  order_line_id uuid references public.crm_commerce_order_lines(id) on delete set null,
  eligibility_check_id uuid references public.crm_return_eligibility_checks(id) on delete set null,
  authorization_id uuid references public.crm_return_authorizations(id) on delete set null,
  returned_qty numeric not null check (returned_qty > 0),
  reason_code text,
  disposition text,
  occurred_at timestamptz not null,
  raw_event_id uuid references public.crm_events(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (workspace_id, source_system, external_return_ref, external_line_ref)
);

create index crm_commerce_orders_email_idx
  on public.crm_commerce_orders(workspace_id, lower(email_at_purchase), occurred_at desc)
  where email_at_purchase is not null;

create index crm_commerce_orders_receipt_idx
  on public.crm_commerce_orders(workspace_id, source_system, receipt_number)
  where receipt_number is not null;

create index crm_commerce_orders_order_number_idx
  on public.crm_commerce_orders(workspace_id, source_system, order_number)
  where order_number is not null;

create index crm_commerce_order_lines_order_idx
  on public.crm_commerce_order_lines(workspace_id, order_id);

create index crm_commerce_order_lines_sku_idx
  on public.crm_commerce_order_lines(workspace_id, lower(sku))
  where sku is not null;

create index crm_commerce_order_lines_product_identity_idx
  on public.crm_commerce_order_lines(workspace_id, product_identity_id)
  where product_identity_id is not null;

create index crm_return_policies_published_idx
  on public.crm_return_policies(workspace_id, effective_from desc)
  where status = 'published';

create index crm_return_eligibility_checks_workspace_idx
  on public.crm_return_eligibility_checks(workspace_id, created_at desc);

create index crm_return_authorizations_check_idx
  on public.crm_return_authorizations(workspace_id, eligibility_check_id, status);

create index crm_return_authorizations_status_idx
  on public.crm_return_authorizations(workspace_id, status, valid_until);

create index crm_commerce_return_facts_line_idx
  on public.crm_commerce_return_facts(workspace_id, order_line_id, occurred_at desc);

alter table public.crm_commerce_orders enable row level security;
alter table public.crm_commerce_order_lines enable row level security;
alter table public.crm_return_policies enable row level security;
alter table public.crm_return_eligibility_checks enable row level security;
alter table public.crm_return_authorizations enable row level security;
alter table public.crm_commerce_return_facts enable row level security;

create policy "Members can manage commerce orders" on public.crm_commerce_orders
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

create policy "Members can manage commerce order lines" on public.crm_commerce_order_lines
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

create policy "Members can manage return policies" on public.crm_return_policies
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

create policy "Members can manage return eligibility checks" on public.crm_return_eligibility_checks
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

create policy "Members can manage return authorizations" on public.crm_return_authorizations
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

create policy "Members can manage commerce return facts" on public.crm_commerce_return_facts
  for all using (public.crm_is_workspace_member(workspace_id))
  with check (public.crm_is_workspace_member(workspace_id));

grant select, insert, update, delete on table
  public.crm_commerce_orders,
  public.crm_commerce_order_lines,
  public.crm_return_policies,
  public.crm_return_eligibility_checks,
  public.crm_return_authorizations,
  public.crm_commerce_return_facts
to service_role;
