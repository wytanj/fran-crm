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

Fran CRM stores these policy versions. Fran POS loads the assigned version and executes it at checkout. Fran SKUMS supplies the quote, product context, and inventory reservation facts the policy must run against.

## L-base FWB engine (2026-07-23)

Pure CRM ledger math lives in `server/fran/loyalty/fwb-engine.ts` (PDF golden earn, fixed dens, theoretical expiry, calendar-year tiers F1/F2/F3, idempotent `commit_sale`).

| Surface | Route / module |
|---------|----------------|
| Active policy for POS | `GET /api/fran/loyalty/policy-versions/active?format=pos` → `FranLoyaltyPolicyBundle` |
| Commit sale | `POST /fran/pos/loyalty/commit-sale` (also `/api/fran/pos/loyalty/commit-sale`) |
| Point batches table | `0010_fran_loyalty_point_batches.sql` (**apply on CRM Supabase**) |
| POS adapter | `server/fran/loyalty/pos-policy-bundle.ts` |

### Migrations you may need to run (Fran CRM Supabase)

| File | Needed when |
|------|-------------|
| `0009_fran_loyalty_policy_versions.sql` | Policy programs/versions/accounts/ledger not already applied (older L-spine) |
| `0010_fran_loyalty_point_batches.sql` | **New (L-base)** — durable FWB point batches + theoretical expiry |

Check: `node scripts/_check_loyalty_migrations.mjs` (from fran-crm root, with Supabase env).

- **Demo** `commit_sale` works **in-memory without 0010**.
- **Durable** ledger batches / Jan-1 expiry storage need **0010** applied.
- SKUMS / POS repos do **not** need a new migration for this L-base slice.

Earn formula: `floor(spend × (tierRate + birthdayAdd + categoryAdd))` with tier rates 1.00 / 1.25 / 1.50.  
Redeem dens: 200→$6 … 2500→$175 only.  
Expiry: `theoretical_expiry_date` set once at earn; F2/F3 freeze clock; Jan 1 F1 drop expires past batches.

Program key aliases: `fran-v2` / `fwb` → `fran_with_benefits`.

## Implemented Policy Spine

`0009_fran_loyalty_policy_versions.sql` adds the first durable policy spine:

- `fran_loyalty_programs`: workspace-scoped loyalty containers such as `fran_with_benefits`.
- `fran_loyalty_policy_versions`: immutable publishable rule snapshots with `rules jsonb`, source document references, effective windows, and publish metadata.
- `fran_loyalty_policy_assignments`: rollout and experiment assignments by workspace default, store, register, member, cohort, or experiment.
- `fran_loyalty_accounts`: CRM member/account snapshots for balances, tier key, spend qualification, and active policy reference.
- `fran_loyalty_ledger`: idempotent economic settlement entries from POS execution events.

The default demo policy bundle encodes Fran loyalty v2.1 as JSON rules with dynamic tier keys, earn multipliers, redemption brackets, expiry behavior, and the execution boundary: policy owner `fran-crm`, executor `fran-pos`, pricing authority `fran-skums`, and inventory authority `fran-skums`.

Policy API routes:

- `GET /api/fran/loyalty/policy-versions`
- `POST /api/fran/loyalty/policy-versions`
- `GET /api/fran/loyalty/policy-versions/active`
- `POST /api/fran/loyalty/policy-versions/[version_id]/publish`
- `POST /api/fran/loyalty/assignments`

Publishing a version retires the previous active default for the same program. Assignment rows can still point a store, register, member, cohort, or experiment at an approved/testing/active version so Fran POS can test loyalty variants without rewriting checkout code.

## Analytics

Fran loyalty analytics are aggregate reads over the member and tier spine:

- current Bronze, Silver, and Gold counts come from `crm_entities.attributes.profile_packs.fran_loyalty.tier`
- new sign-ups use `crm_entities.attributes.profile_packs.fran_member.member_since`, falling back to `crm_entities.created_at`
- evaluation-cycle trend and movement counts are recorded in `fran_loyalty_tier_evaluation_cycles`
- points issued and redeemed are aggregated from `crm_events` for the requested period
- redemption rate is `points redeemed / points issued`, returning `0` when no points were issued
- outstanding liability is current unredeemed points multiplied by the configured minor-currency value per point
- expiry risk uses `points_expiring_soon` and `points_expiry_date` inside the notification window
- top spenders and lifecycle inactivity lists are derived from transaction events with CRM person references
- birthday member lists use the Fran member and loyalty profile packs
- campaign performance aggregates campaign reach, transaction, points-awarded, and revenue events

Claude/MCP analytics tools use the same source data and authorization boundary. `fran.analytics.topCustomers` ranks customers inside a requested purchase window, returns chart-ready data, records MCP request, execution, and audit rows, and redacts contact fields unless the caller has `customer.contact.read`.

The cycle table stores aggregate totals only: member count, tier counts, upgraded count, downgraded count, retained count, optional policy reference, and provenance metadata. Member-level tier movement should remain in source events, facts, execution logs, or a future detailed cycle-result table when the loyalty evaluator needs drilldown. Exportable operator lists must stay compact and workspace-scoped. A future loyalty ledger can replace event-derived point-flow aggregates without changing the operator dashboard contract.

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

## Remaining Tables

Fran-specific tables should be added only when crmOS primitives are not enough:

- `fran_reward_catalog`
- `fran_reward_rules`
- `fran_reward_quotes`
- `fran_reward_commits`
- `fran_counter_sessions`

Every table must be workspace-scoped and should preserve source system, idempotency key, actor, subject, context, payload, and schema version where applicable.
