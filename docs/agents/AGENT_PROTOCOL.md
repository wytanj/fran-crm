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

Future MCP tools should expose workspace-scoped actions:

- Search graph.
- Read entity neighborhood.
- Propose schema field.
- Propose identity merge.
- Request approval.
- Execute approved action.

MCP tools should use the same proposal, approval, execution, and audit tables as the web app.

Public app reference: `/docs/agents`.
