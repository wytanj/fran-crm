# Agent Skills And Capabilities

This document describes the skills agents should expose when operating inside a Fran CRM workspace.

## Core Skills

### Graph Search

Find people, companies, orders, tickets, messages, campaigns, products, and custom records in a workspace.

Expected inputs:

- `workspace_id`
- `query`
- optional entity type filters

Expected output:

- matching entity IDs
- labels
- types
- tags
- relevant external IDs

### Entity Neighborhood Read

Read an entity and its connected graph neighborhood.

Expected inputs:

- `workspace_id`
- `entity_id`
- relationship depth

Expected output:

- entity attributes
- connected entities
- relationship types
- confidence and source metadata

### Schema Field Proposal

Suggest a new field for an entity type without silently mutating production schema.

Expected inputs:

- `workspace_id`
- `entity_type`
- `key`
- `label`
- `value_type`
- `required`
- rationale

Expected output:

- `crm_agent_proposals` record
- proposed action payload

### Identity Merge Proposal

Stage a customer/account merge when imported or inferred records likely refer to the same real-world entity.

Expected inputs:

- `workspace_id`
- source entity IDs
- confidence
- rationale
- expected merged attributes

Expected output:

- proposal requiring approval
- no destructive write before approval

### Approval Request

Move a proposal into review when human approval is required.

Expected inputs:

- `workspace_id`
- `proposal_id`
- requested approver role

Expected output:

- proposal status update
- audit event

### Approved Execution

Execute an approved proposal and record the result.

Expected inputs:

- `workspace_id`
- `proposal_id`

Expected output:

- changed records
- `crm_execution_logs` entry
- `crm_audit_events` entry

### Return Eligibility Check

Answer a POS counter request without exposing the full customer graph.

Expected inputs:

- `workspace_id`
- customer email
- product SKU, barcode, product identity, or name
- optional order date
- optional receipt or order number
- requested quantity
- requested action

Expected output:

- decision: `eligible`, `exchange_only`, `store_credit_only`, `manager_review`, `ineligible`, `not_found`, or `insufficient_context`
- allowed actions
- optional authorization ID
- counter-safe matched purchase evidence
- reason codes
- manager approval requirement

### Fran Member Resolve

Resolve a POS-supplied member identifier without exposing raw CRM graph tables.

Expected inputs:

- `workspace_id`
- identifier type: `phone`, `member_number`, `qr`, `barcode`, or `external_ref`
- identifier value
- source system

Expected output:

- status: `exact`, `candidates`, `none`, or `ambiguous`
- person id when exact
- member reference when exact
- candidate summaries when needed
- warnings

### Fran Counter Session

Create the POS-safe counter projection for a resolved member.

Expected inputs:

- `workspace_id`
- person id or member reference
- source system
- optional store, register, and cashier context

Expected output:

- session id
- member identity
- POS-visible profile fields
- tier badge and points balance
- reward availability summary
- safe beauty profile warnings
- source freshness

### Fran Loyalty Analytics Read

Read aggregate loyalty analytics without exposing raw member profiles.

Expected inputs:

- `workspace_id`

Expected output:

- current Bronze, Silver, and Gold member counts
- new sign-up trend by day, week, and month
- tier-count trend over evaluation cycles
- upgraded and downgraded member counts per evaluation cycle
- points issued, points redeemed, and redemption rate for a date range
- outstanding points liability and expiry notification exposure
- top spenders by lifetime and trailing 12-month spend
- at-risk and lapsed member export lists based on configurable inactivity thresholds
- birthday members for the current calendar month
- campaign reach, transaction, points-awarded, and revenue performance
- warning when historical cycle storage has not been migrated yet

### Fran Top Customers Analytics

Answer staff questions such as "who are the best 10 customers in the last 5 days and chart their purchases" without exposing arbitrary CRM tables.

Expected inputs:

- `workspace_id`
- inclusive `from` and `to` dates
- `limit`
- ranking metric: `purchase_amount` or `purchase_count`
- optional `includeContact`

Required capabilities:

- `agent.tool.execute`
- `analytics.customer_list.read`
- `customer.purchase.read`
- `customer.contact.read` only when contact fields are requested

Expected output:

- ranked customer rows with person id, display name, tier, purchase count, spend, and last purchase date
- contact fields only when permitted
- chart-ready bar data
- `crm_execution_logs` entry
- `crm_audit_events` entry

## Restricted Skills

These should require explicit capability grants:

- Exporting audiences or customer data.
- Calling third-party integrations.
- Mutating billing/subscription state.
- Deleting records.
- Bulk updating many entities.
- Writing directly to `crm_field_definitions` without a proposal.
- Creating return policies or issuing manager overrides outside published policy.
- Reading customer-level purchase analytics without `analytics.customer_list.read` and `customer.purchase.read`.
- Revealing contact fields through chat/MCP tools without `customer.contact.read`.

## Future MCP Shape

Future MCP tools should map to these skills with workspace-scoped authorization and should reuse the same API, proposal, approval, execution, and audit tables as the web application. Return eligibility should map to a narrow `crm.returns.checkEligibility` tool rather than a broad customer-graph read. The first implemented customer analytics tool is `fran.analytics.topCustomers`.
