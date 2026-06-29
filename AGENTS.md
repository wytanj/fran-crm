# Agent Operating Guide

Fran CRM is an opinionated crmOS build for Fran POS. Treat the Supabase database as the customer, member, loyalty, reward, and provenance spine, and treat the Nuxt app as one operating client of that spine.

## Required Maintenance Rule

When a change touches any of these surfaces, update the matching documentation in the same change:

- API route behavior: update `docs/agents/API_CONTRACT.md`.
- Database tables, entity types, base fields, or relationships: update `docs/agents/DATA_MODEL.md`.
- Agent permissions, proposal flow, execution rules, or audit behavior: update `docs/agents/AGENT_PROTOCOL.md`.
- Agent skills or capabilities: update `docs/agents/SKILLS.md`.
- Public documentation UI: update the matching Markdown page in `content/docs`.
- Fran POS, loyalty, reward, or counter-session behavior: update `docs/fran-crm-contract.md`, `docs/fran-loyalty-policy.md`, `README.md`, and relevant app pages.

The test suite includes documentation coverage checks for API routes. Add or update those tests when the agent-facing contract expands.

## Agent Safety Rules

- Work inside a single `crm_workspaces.id` boundary.
- Prefer proposals over direct writes for schema changes, identity merges, exports, and integration actions.
- Preserve provenance through `source`, `external_ids`, `crm_agent_proposals`, `crm_approvals`, `crm_execution_logs`, and `crm_audit_events`.
- Keep Fran rules in `server/fran/**`, `server/api/fran/**`, `server/routes/fran/**`, or `app/pages/fran/**` unless the helper remains genuinely reusable upstream.
- Do not let Fran-specific loyalty or beauty profile rules leak into generic crmOS helpers.
- Keep the API layer stable enough for future MCP tools.
