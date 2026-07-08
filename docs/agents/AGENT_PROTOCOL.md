# Agent Protocol

Agents are first-class workspace participants, but their default behavior is proposal-first.

## Default Workflow

1. Read the current graph, field definitions, relationships, and data source context.
2. Produce a structured proposal in `crm_agent_proposals`.
3. Wait for approval in `crm_approvals` when the action changes schema, identity, exports, or external systems.
4. Execute the approved action through the API layer.
5. Record output in `crm_execution_logs`.
6. Preserve a durable event in `crm_audit_events`.

## Schema Extension Example

```json
{
  "type": "add_field",
  "entity_type": "person",
  "key": "preferred_channel",
  "label": "Preferred channel",
  "value_type": "text",
  "required": false,
  "origin": "agent",
  "rationale": "Support and ecommerce imports both reference contact preference."
}
```

## Direct Writes

Direct writes should be limited to low-risk draft or staging actions. Use proposals for:

- Adding or changing schema.
- Merging identities.
- Exporting audiences.
- Triggering integrations.
- Mutating billing state.
- Any action that affects many records.

## Staff And Connector Permissions

Chat and AI surfaces are entry points, not permission systems. Slack, Teams, or Claude connector access must resolve to a Fran CRM workspace user before any data tool runs.

The server authorization order is:

1. Record the incoming MCP `tools/call` request in `crm_mcp_request_logs` with sanitized arguments and the raw requested workspace inside those arguments.
2. Verify the platform or bearer token.
3. Resolve the requested `crm_workspaces.id`.
4. Resolve the human CRM user or approved service principal.
5. Load role defaults plus `crm_agent_capability_grants`.
6. Check every capability required by the tool.
7. Execute the narrow API/tool.
8. Update the MCP request log with final status, then write `crm_execution_logs` and `crm_audit_events` for successful executions.

Connector install records live in `crm_agent_connector_installs`. External staff identity mappings live in `crm_staff_identity_links`. Capability overrides live in `crm_agent_capability_grants`.

Claude Team custom connector setup is split intentionally:

- Fran CRM owns the remote MCP URL, setup metadata, tool contracts, permission checks, and audit logs.
- Claude Team Owners still add the connector in Claude organization settings.
- Individual staff still authenticate/connect before Claude can act on their behalf, unless a future managed-auth setup is explicitly adopted.

## Operational Eligibility Checks

Counter-safe eligibility checks can execute directly when they are narrow, workspace-scoped, and backed by an existing published policy. `POST /api/v1/pos/returns/eligibility` is one of these direct operational checks: it evaluates product, customer email, optional purchase hints, and requested action, then records an eligibility check and optional authorization.

Agents and integrations must still use proposals or explicit approval for:

- Creating or changing return policies.
- Manager overrides that authorize returns outside policy.
- Identity merges used to improve return matching.
- Exporting return history or customer purchase data.
- Changing connector fallback behavior.

Completed POS return events consume authorizations and update returned-quantity counters through idempotent facts. Replayed outbox events must not create duplicate returned quantity.

## MCP Direction

MCP tools should expose workspace-scoped actions:

- Search graph.
- Read entity neighborhood.
- Propose schema field.
- Propose identity merge.
- Request approval.
- Execute approved action.

MCP tools should use the same proposal, approval, execution, request-log, and audit tables as the web app.

The first implemented MCP tool is `fran.analytics.topCustomers`. It answers purchase-ranking questions with compact chart-ready output, requires customer-level analytics permissions, and redacts contact fields without `customer.contact.read`.

Public app reference: `/docs/agents`.
