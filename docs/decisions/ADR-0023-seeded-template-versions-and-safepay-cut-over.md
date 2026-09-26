---
ID: ADR-0023
aliases: [ADR-0023]
Title: Seeded agreement templates publish new versions; PKR checkout moves to Safepay
Status: ACCEPTED
CreatedAt: 2026-09-26
UpdatedAt: 2026-09-26
---
# ADR-0023 — Seeded agreement templates publish new versions; PKR checkout moves to Safepay

## Status

Accepted — 2026-09-26, answered by the product owner ("Yes for 0207 and 0210").
Both are `USER_CONFIRMED`. Related: [[ITEM-0207]], [[ITEM-0210]].

## Context

1. `seed:config` — which the production pre-deploy command runs on every
   deploy — rewrote version 1 of each system agreement template in place. When
   TASK-0032 changed those templates, version 1 silently took on new text, so a
   template's history no longer showed what earlier agreements had been drafted
   from.
2. Safepay shipped with SESSION-0108 behind `SAFEPAY_ENABLED` (default false),
   so PKR checkout stayed on Stripe until the owner chose a cut-over and
   decided what happens to existing PKR Stripe subscribers.

## Decision

1. **A seeded template change is published as a new version.** `seed:config`
   never rewrites an existing version. When the seeded title or content differs
   from the latest version, and that latest version is the seed's own, the seed
   publishes the next version exactly as an operator edit does (the previous
   published version is unpublished). When an operator has published their own
   version of a system template, a deploy leaves it in place.
   (`planSystemContractTemplateWrite` in `services/api/prisma/seed-config.ts`.)
2. **PKR checkout moves to Safepay** — for new checkouts only. Existing PKR
   subscriptions keep renewing through Stripe; migrating them would need its
   own ExecPlan and is not part of this decision. The switch happens by setting
   `SAFEPAY_ENABLED=true` in production once the Safepay merchant credentials
   (`SAFEPAY_ENVIRONMENT`, `SAFEPAY_API_KEY`, `SAFEPAY_SECRET_KEY`,
   `SAFEPAY_WEBHOOK_SECRET`) are configured on the API service; with the flag
   on and any of them missing, the gateway refuses PKR checkout.

## Consequences

- A template's version list is now its real history. Production's version 1
  already carries the current seeded text, so the first deploy after this
  change writes nothing.
- An operator who customises a system template keeps their text across
  deploys, and also stops receiving seeded updates to it until they re-adopt
  the system text.
- Safepay is blocked only on the owner supplying the merchant credentials; no
  further code change is required. Stripe remains the PKR provider until then.
