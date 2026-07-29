---
title: Fran POS contracts
description: Counter routes and guardrails for member identity, loyalty policy, and reward decisions behind Fran POS.
kicker: Fran POS
---

## What this is

Fran POS is the register UX. Fran CRM owns member identity, loyalty policy, points ledger, and POS-safe counter projections. Fran SKUMS owns catalog, price, stock, and sale facts.

Live loyalty traffic uses:

```text
POS  --(SKUMS API key)-->  SKUMS /fran/pos/loyalty/*  -->  Fran CRM
POS  --(same key)------->  SKUMS catalog / quote / sale
```

CRM is linked on the **SKUMS workspace** (Integrations → Fran CRM). The register does not store CRM service secrets. Copy your CRM workspace ID from **Settings** in this app.

## Guardrails

- POS reads decision routes, never raw graph tables.
- Restricted fields stay filtered by backend projection.
- Loading a policy never mutates points. Commit and reverse are idempotent.
- POS executes assigned policy versions against SKUMS price and inventory truth.
- Analytics stay aggregate and workspace-scoped.

## Counter and loyalty routes

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/fran/pos/member/resolve` | Resolve phone, member number, QR, barcode, or external reference to a person id. |
| `POST` | `/fran/pos/counter-session` | Build the counter projection for identity, loyalty, rewards, and safety context. |
| `GET` | `/api/fran/analytics` | Tier mix, sign-up trends, and cycle movement for one workspace. |
| `GET` | `/api/fran/loyalty/policy-versions/active` | Policy bundle POS executes against a SKUMS basket quote (`format=pos` for the register). |
| `GET` | `/api/fran/loyalty/policy-versions` | List draft, testing, approved, active, and retired versions. |
| `POST` | `/api/fran/loyalty/policy-versions` | Create a draft, testing, or approved policy version. |
| `POST` | `/api/fran/loyalty/policy-versions/[version_id]/publish` | Publish a version as its program default. |
| `POST` | `/api/fran/loyalty/assignments` | Assign a version to a workspace, store, register, member, cohort, or experiment. |
| `POST` | `/fran/pos/loyalty/commit-sale` | Settle earn/redeem after payment (also under `/api/fran/pos/loyalty/commit-sale`). |
| `POST` | `/fran/pos/loyalty/vouchers/*` | Quote redeem dens, authorize scan, issue birthday/category vouchers. |
| `POST` | `/fran/pos/basket/preview` | Placeholder. Evaluation runs locally from the policy bundle and SKUMS quote. |
| `POST` | `/fran/pos/rewards/quote` | Planned. Validate redemption before payment. |
| `POST` | `/fran/pos/rewards/commit` | Planned. Idempotent points commit after payment. |
| `POST` | `/fran/pos/rewards/reverse` | Planned. Idempotent reversal for voids. |

Root `/fran/pos/*` routes match the Fran POS contract. `/api/fran/pos/*` aliases remain for Nuxt API conventions.

## Setup checklist

1. Sign in to Fran CRM and open **Settings**.
2. Copy **CRM base URL** and **CRM workspace ID**.
3. On Fran SKUMS (your test or prod workspace) → **Integrations → Fran CRM** → paste URL + workspace ID → Test policy.
4. Create a SKUMS **POS connector** key (`pos:read` + `pos:write`).
5. On Fran POS Live → **Settings → SKUMS connector** → SKUMS URL + that key only.

See also: [API docs](/docs/api), engineering contracts in `docs/fran-crm-contract.md` and `docs/fran-loyalty-policy.md`.
