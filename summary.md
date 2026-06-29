# crmOS Return Eligibility Summary

## Overview

This change implements the crmOS side of the POS return and exchange eligibility handoff. POS can now ask crmOS for a counter-safe return decision using customer email, product identity, optional purchase hints, quantity, and requested action.

## Key Changes

- Added `POST /api/v1/pos/returns/eligibility` for POS-facing return checks.
- Added workspace-scoped commerce memory tables for orders, order lines, return policies, eligibility checks, authorizations, and completed return facts.
- Added return policy evaluation with stable decisions: `eligible`, `exchange_only`, `store_credit_only`, `manager_review`, `ineligible`, `not_found`, and `insufficient_context`.
- Projected sale/order events into commerce order memory from `POST /api/v1/events`.
- Projected completed return events into idempotent return facts, consumed authorizations, and returned-quantity counters.
- Kept the POS response narrow and counter-safe, without exposing the full customer graph or confidential profile fields.
- Updated agent-facing and public docs for API, data model, agent protocol, and skills.
- Updated self-host setup guidance to include the new return eligibility migration.

## Database

New migration:

- `supabase/migrations/0005_return_eligibility.sql`

New tables:

- `crm_commerce_orders`
- `crm_commerce_order_lines`
- `crm_return_policies`
- `crm_return_eligibility_checks`
- `crm_return_authorizations`
- `crm_commerce_return_facts`

All new tables are workspace-scoped, indexed for lookup paths, and RLS-enabled.

## Verification

- `npm test`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

All passed. `git diff --check` reported only CRLF normalization warnings.
