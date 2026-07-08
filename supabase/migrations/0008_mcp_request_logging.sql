create table public.crm_mcp_request_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.crm_workspaces(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  provider text not null default 'mcp',
  client_name text,
  method text not null,
  tool_name text,
  status text not null default 'received' check (status in ('received', 'succeeded', 'failed', 'rejected')),
  request jsonb not null default '{}'::jsonb,
  response_summary jsonb not null default '{}'::jsonb,
  error jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index crm_mcp_request_logs_workspace_created_idx
  on public.crm_mcp_request_logs(workspace_id, created_at desc);

create index crm_mcp_request_logs_actor_created_idx
  on public.crm_mcp_request_logs(actor_id, created_at desc);

create index crm_mcp_request_logs_tool_status_idx
  on public.crm_mcp_request_logs(workspace_id, tool_name, status, created_at desc);

alter table public.crm_mcp_request_logs enable row level security;

create policy "Members can read MCP request logs"
  on public.crm_mcp_request_logs
  for select
  to authenticated
  using (
    workspace_id is not null
    and public.crm_is_workspace_member(workspace_id)
  );

grant select on table public.crm_mcp_request_logs to authenticated;
grant select, insert, update, delete on table public.crm_mcp_request_logs to service_role;
