---
title: Fran CRM Documentation
description: Contracts for the Fran CRM API, POS projections, loyalty policy, agent protocol, data model, and agent skills.
kicker: Documentation
---

## What This Is

Fran CRM is an opinionated crmOS build for Fran POS. It keeps the upstream workspace, graph, event, profile-pack, proposal, approval, execution-log, and audit primitives, then adds Fran defaults for member identity, loyalty status, reward decisions, and POS-safe counter projections.

## Documentation Map

| Area | Use it for |
| --- | --- |
| API docs | Routes, payloads, response modes, Fran POS contracts, and API behavior. |
| Agent protocol | How agents read, propose, wait for approval, execute, and audit work. |
| Agent skills | The specific CRM capabilities agents can safely use. |
| Data model | Base entity types, minimum customer fields, graph relationships, and schema extension rules. |

## Native Docs Direction

The public documentation is rendered inside the Nuxt app from Markdown files in `content/docs`. That keeps the docs accessible in the product, versioned with the code, and easy for agents to update in the same pull request as contract changes.

Agent-facing source-of-truth docs still live under `docs/agents`. When API behavior, schema, protocol, or skills change, update both the internal agent contract and the matching public docs page.

## Operating Principles

- Treat Supabase as the portable data spine for customers, members, loyalty, rewards, provenance, and audit records.
- Treat the API layer as the stable contract for Fran POS, integrations, agents, and future MCP tools.
- Treat agents as governed operators that can read broadly inside a workspace, but must propose sensitive changes.
- Keep provenance attached to imported data, schema changes, identity merges, and agent actions.
- Keep Fran rules in Fran-specific code surfaces unless a helper remains genuinely reusable upstream.
