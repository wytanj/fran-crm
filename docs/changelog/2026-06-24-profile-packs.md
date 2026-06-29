# 2026-06-24 Profile Packs

## Summary

Added the first generic profile-pack slice inherited from upstream crmOS. Fran CRM now uses the same generic mechanism for Fran member, loyalty, and beauty profile packs rather than permanent customer columns or POS-specific schema.

## Shipped

- Added `crm_profile_packs` as the workspace-scoped installed pack registry.
- Extended `crm_field_definitions` with pack scope, sensitivity, POS visibility, cashier editability, marketing usability, UI contexts, sort order, and metadata.
- Kept MVP current values in `crm_entities.attributes.profile_packs`.
- Kept profile update provenance in `crm_customer_facts`.
- Replaced the inherited fixture registry with Fran default packs: `fran_member`, `fran_loyalty`, and `fran_beauty_profile`.
- Added profile-pack list, detail, install, counter-profile, and profile-field update APIs.
- Added a Schema page pack installer and richer field rows.
- Kept the generic Graph detail profile-pack panel rendering from definitions instead of hardcoded pack keys.
- Updated agent and public docs for API and data-model contract changes.

## Design Notes

The dedicated `crm_profile_field_values` table is intentionally deferred. The current split is simpler and stable enough for the first UI:

```text
current state -> crm_entities.attributes.profile_packs
provenance -> crm_customer_facts
stable client contract -> API projections
```

This allows POS and future customers to consume stable profile projections without depending on CRM storage internals. If later query patterns need a normalized value table, the storage can move behind the same API contract.

## Customer Extension Principle

Future merchants should be able to add packs such as `pet_care`, `sports_retail`, `b2b_account`, or their own vertical fields using the same pack registry, field definitions, validation, UI renderer, facts, and projection APIs.
