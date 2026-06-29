grant usage on schema public to service_role;

grant select, insert, update, delete on table
  public.crm_workspaces,
  public.crm_workspace_members,
  public.crm_billing_customers,
  public.crm_subscriptions,
  public.crm_entity_types,
  public.crm_field_definitions,
  public.crm_entities,
  public.crm_relationships,
  public.crm_data_sources,
  public.crm_integration_accounts,
  public.crm_import_batches,
  public.crm_agent_proposals,
  public.crm_approvals,
  public.crm_execution_logs,
  public.crm_audit_events,
  public.crm_events,
  public.crm_external_links,
  public.crm_customer_facts,
  public.crm_consent_records,
  public.crm_customer_profiles,
  public.crm_segment_memberships,
  public.crm_metric_definitions
to service_role;

revoke all on function public.crm_is_workspace_member(uuid) from public;
grant execute on function public.crm_is_workspace_member(uuid) to authenticated, service_role;
