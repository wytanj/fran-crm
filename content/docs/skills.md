---
title: Agent Skills
description: The base CRM capabilities agents can use for graph reading, schema proposals, approvals, and governed execution.
kicker: Skills
---

## Available Skills

| Skill | Mode | Description |
| --- | --- | --- |
| Graph search | Read | Find entities by label, tags, attributes, external IDs, and type filters inside a workspace. |
| Entity neighborhood | Read | Read one entity with connected entities, relationship types, confidence, and provenance. |
| Schema field proposal | Propose | Suggest a new custom field for a base or custom entity type. |
| Identity merge proposal | Propose | Stage possible duplicate customer or account merges without destructive writes. |
| Approval request | Govern | Move proposals into review for owners, admins, or authorized human operators. |
| Approved execution | Execute | Run approved actions, record outputs, and preserve audit trail. |
| Return eligibility check | Operational | Answer POS return or exchange eligibility with a counter-safe decision and optional authorization. |

## Skill Boundaries

Read skills can gather context across the workspace graph. Write skills should go through proposals unless the organization has granted explicit automation rights.

Agents should prefer small, explainable proposals. A schema proposal that adds one field with clear provenance is easier to approve than a broad rewrite of the data model.

Return eligibility checks are operational, not graph browsing. They should return the decision, allowed actions, reason codes, manager requirement, optional authorization ID, and matched purchase evidence safe for counter staff. Return-policy creation, manager overrides, and customer-data exports remain governed actions.

## Future MCP Shape

The future MCP layer should expose these skills as typed tools over the same API contracts:

- `crm.graph.search`
- `crm.entity.neighborhood`
- `crm.schema.proposeField`
- `crm.identity.proposeMerge`
- `crm.approval.request`
- `crm.execution.runApproved`
- `crm.returns.checkEligibility`

MCP tools should not bypass workspace boundaries, approvals, or audit logging.
