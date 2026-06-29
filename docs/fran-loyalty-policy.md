# Fran Loyalty Policy

Fran loyalty rules must be versioned before they drive POS-visible decisions. Draft policies can be proposed by humans or agents, but publish requires approval.

## Policy Responsibilities

A published policy version should define:

- tier names and qualification windows
- earn rate by eligible spend
- points expiry rules
- next-tier progress calculation
- reward catalogue eligibility
- quote reservation behavior
- commit and reverse idempotency windows
- manager-review triggers

## Initial Defaults

The current buildout ships mocked values only:

- `Gold` member tier
- `18,420` points balance
- `1,200` points expiring soon on `2026-08-31`
- next tier `Platinum`
- `660` spend to next tier
- `$5 reward` as an eligible mock reward
- `Platinum bonus` as a blocked mock reward

These values are fixtures for counter-session contract development. They are not yet backed by loyalty ledger tables.

## Mutation Rules

Agents may propose:

- suspicious reward abuse review
- duplicate member merge
- loyalty policy draft
- reward catalogue update
- balance adjustment

Agents must not directly execute:

- balance adjustment
- reward policy publish
- member merge
- sensitivity downgrade
- destructive profile cleanup

## Planned Tables

Fran-specific tables should be added only when crmOS primitives are not enough:

- `fran_loyalty_programs`
- `fran_loyalty_policy_versions`
- `fran_loyalty_accounts`
- `fran_loyalty_ledger`
- `fran_reward_catalog`
- `fran_reward_rules`
- `fran_reward_quotes`
- `fran_reward_commits`
- `fran_counter_sessions`

Every table must be workspace-scoped and should preserve source system, idempotency key, actor, subject, context, payload, and schema version where applicable.
