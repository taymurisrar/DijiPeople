---
ID: BUG-3180
aliases: [BUG-3180]
Title: The Render service cannot be rebuilt from the repository: seven boot-required env vars are absent from render.yaml
Status: OPEN
Severity: HIGH
Priority: P1
Type: INFRA
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [render.yaml]
OwnerAgent: architect
ArchitectDisposition: TRIAGE_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-10
ResolvedAt:
---

# BUG-3180 — The Render service cannot be rebuilt from the repository: seven boot-required env vars are absent from render.yaml

## Summary

The Render service cannot be rebuilt from the repository: seven boot-required env vars are absent from render.yaml

Identified by the 2026-09-10 full technical audit as INF-04 (confidence: INF-04=CONFIRMED).

## Expected Behavior

`render.yaml` declares every key the application requires at boot (values `sync: false`), so the file is a complete recipe and the dashboard supplies only secrets.

## Actual Behavior

Recreating the API service from `render.yaml` alone produces a service that fails `validateApiEnvironment` at boot with seven errors, and — once those are guessed — a service that cannot take payments because the Stripe configuration is undeclared. The values themselves exist only in the Render dashboard and in one person's Windows user environment.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**INF-04** (render.yaml, services/api/src/config/env.validation.ts):

`services/api/src/config/env.validation.ts:8-23` lists the variables whose
absence throws at boot in production:
```ts
const PRODUCTION_REQUIRED_ENV = [
  'NODE_ENV', 'API_BASE_URL', 'API_ORIGIN', 'DATABASE_URL',
  'CORS_ALLOWED_ORIGINS', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET',
  'ADMIN_APP_URL', 'WEB_APP_URL', 'LANDING_APP_URL',
  'ACCOUNT_ACTIVATION_LINK_BASE_URL', 'PASSWORD_RESET_LINK_BASE_URL',
  'COOKIE_SECURE', 'COOKIE_SAME_SITE',
] as const;
```
and `env.validation.ts:45-49` makes each a hard failure:
```ts
for (const key of PRODUCTION_REQUIRED_ENV) {
  if (!hasValue(env[key])) { errors.push(`${key} is required in production.`); }
}
```

Extracting all 43 `- key:` entries from `render.yaml` and diffing against that
list, **seven are absent**: `API_BASE_URL`, `ADMIN_APP_URL`, `WEB_APP_URL`,
`ACCOUNT_ACTIVATION_LINK_BASE_URL`, `PASSWORD_RESET_LINK_BASE_URL`,
`COOKIE_SECURE`, `COOKIE_SAME_SITE`. The Stripe trio is absent as well
(INF-03).

`docs/deployment/platform-access.md:41-49` — every credential lives in exactly
one place:
> All three are **User-scope Windows environment variables** on the
> maintainer's workstation.

---


Full finding text: INF-04 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/INF.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

The specific data-loss case is worth stating on its own. `SECRET_ENCRYPTION_KEY` is `sync: false` — held only in the Render dashboard — and `render.yaml:118-121` records that `SecretEncryptionService` uses it to encrypt third-party integration credentials at rest in the database. **If the Render service is deleted or the key is lost, every encrypted integration credential in the production database becomes permanently undecryptable**, and the database backup (such as it is) does not help, because the ciphertext is what is backed up. There is no documented escrow for this key.

More broadly: the recovery story for "the Render service is gone" is "one person reconstructs it from memory", and that person holds all three provider tokens on one laptop.

## Affected Areas

render.yaml

## Proposed Resolution

1. Add the seven missing keys plus `STRIPE_MODE`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `STRIPE_API_VERSION` to `render.yaml` with `sync: false`.
2. Add a boot-time or CI assertion that every name in `PRODUCTION_REQUIRED_ENV` appears in `render.yaml` — a ten-line test in `services/api/src/config/` that reads the YAML, so the two lists cannot drift again.
3. Escrow `SECRET_ENCRYPTION_KEY` and the three provider tokens somewhere other than one workstation (a password manager shared with a second person is sufficient; this does not need a KMS).

(Difficulty: LOW; Regression risk: LOW; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for render.yaml, services/api/src/config/env.validation.ts (audit id INF-04).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: INF-04=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `INF-04` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/INF.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (INF-04) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
