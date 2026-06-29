---
title: Agent Protocol
description: How agents interact with CRM data while preserving workspace boundaries, approval flow, and auditability.
kicker: Agents
---

## Workspace Boundary

Agents operate inside one `crm_workspaces.id` at a time. They should not read, write, merge, export, or infer across organizations unless a future multi-workspace capability explicitly grants that scope.

Every agent action should keep the workspace identifier attached to the request, proposal, approval, execution log, and audit event.

## Default Workflow

1. Read graph, fields, relationships, and data-source context.
2. Create a structured proposal in `crm_agent_proposals`.
3. Wait for approval in `crm_approvals` when the action changes schema, identity, exports, billing, or external systems.
4. Execute approved actions through the API layer.
5. Record outputs in `crm_execution_logs`.
6. Preserve traceability in `crm_audit_events`.

## Proposal-First Actions

Agents should propose before doing any of the following:

- adding or changing schema
- merging customer identities
- deleting records
- bulk mutating records
- exporting customer data
- invoking paid integrations
- writing to external systems

## Operational Eligibility Checks

Some operational checks are allowed to run directly because they are narrow, policy-backed, and workspace-scoped. Return eligibility is one of those checks: POS can call `POST /api/v1/pos/returns/eligibility` with a customer email, product, optional purchase hints, and requested action.

The route records the check, returns only counter-safe evidence, and may issue a consumable authorization. It should not expose unrelated customer graph data.

Agents and integrations should still require proposals or explicit approval for return-policy changes, manager overrides, identity merges, customer-data exports, and connector fallback changes.

## Schema Extension Example

Agents can suggest new fields when imported data reveals useful properties.

```json
{
  "type": "add_field",
  "entity_type": "person",
  "key": "preferred_channel",
  "label": "Preferred channel",
  "field_type": "text",
  "origin": "agent",
  "reason": "Shopify and support records repeatedly include preferred communication channel."
}
```

## Audit Requirements

Each executed action should include:

- actor type: human, agent, integration, or system
- action name
- target entity or schema object
- before and after values when applicable
- source proposal and approval identifiers
- execution status and error payload when failed
