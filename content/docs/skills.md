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
| Fran loyalty analytics read | Read | Return aggregate tier, sign-up, points, liability, lifecycle, birthday, campaign, and compact export metrics without exposing full profiles. |

## Skill Boundaries

Read skills can gather context across the workspace graph. Write skills should go through proposals unless the organization has granted explicit automation rights.

Agents should prefer small, explainable proposals. A schema proposal that adds one field with clear provenance is easier to approve than a broad rewrite of the data model.

Return eligibility checks are operational, not graph browsing. They should return the decision, allowed actions, reason codes, manager requirement, optional authorization ID, and matched purchase evidence safe for counter staff. Return-policy creation, manager overrides, and customer-data exports remain governed actions.

Fran loyalty analytics reads return aggregate metrics plus compact operator export rows. Agents can use them to answer tier-count, sign-up trend, upgrade/downgrade-cycle, points issued, points redeemed, redemption-rate, liability, expiry-risk, top-spender, inactivity, birthday, and campaign-performance questions without reading full member profiles or unrelated graph rows.

Fran top-customer analytics answers date-ranged purchase-ranking questions through `fran.analytics.topCustomers`. The tool returns ranked rows and chart-ready bar data. It requires `agent.tool.execute`, `analytics.customer_list.read`, and `customer.purchase.read`; contact fields require `customer.contact.read`.

## Future MCP Shape

The future MCP layer should expose these skills as typed tools over the same API contracts:

- `crm.graph.search`
- `crm.entity.neighborhood`
- `crm.schema.proposeField`
- `crm.identity.proposeMerge`
- `crm.approval.request`
- `crm.execution.runApproved`
- `crm.returns.checkEligibility`
- `crm.fran.analytics.read`
- `fran.analytics.topCustomers`

MCP tools should not bypass workspace boundaries, approvals, or audit logging.
