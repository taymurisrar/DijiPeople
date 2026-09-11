---
ID: BUG-3181
aliases: [BUG-3181]
Title: Single environment: no staging, one Neon branch, one Stripe account, one email sender, and demo data in production
Status: PRODUCT_DECISION
Severity: HIGH
Priority: P1
Type: INFRA
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [docs/deployment]
OwnerAgent: architect
ArchitectDisposition: PRODUCT_DECISION
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3181 — Single environment: no staging, one Neon branch, one Stripe account, one email sender, and demo data in production

> **Architect triage, 2026-09-11 — `PRODUCT_DECISION`.** One environment, one Neon branch, one Stripe account, one sender. Every remedy costs money or people. The owner decides whether a staging environment is bought.

## Summary

Single environment: no staging, one Neon branch, one Stripe account, one email sender, and demo data in production

Identified by the 2026-09-10 full technical audit as INF-07 (confidence: INF-07=CONFIRMED).

## Expected Behavior

At minimum a preproduction target that shares the code path and shares nothing else, so a migration, a seed and a release chain can be exercised before they touch customer data.

## Actual Behavior

Code goes from a developer's laptop to production. The demo tenant that QA drives lives in the production database alongside real tenants. One Stripe account, one SMTP sender.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**INF-07** (whole estate):

`docs/deployment/environments.md:11-16`:
> | **STAGING** | **Does not exist** | No configuration … nothing is provisioned |
> | DEV / UAT | Not configured | Historical `uat-*` log files exist at the repo root, but no committed configuration |
>
> Do not assume a staging environment is available. Promotion today is
> local → production.

`docs/deployment/platform-access.md:198` — the Neon project has one branch:
```
| Branch | `production`, `br-snowy-mud-am2378xn` — default, **not protected** |
```

`docs/bugs/BUG-0903…md` — one Stripe account, currently in test mode:
```
STRIPE_MODE = test
```
with `Status: ACCEPTED_RISK`, `Severity: HIGH`.

`render.yaml:206-224` — a single set of `EMAIL_SMTP_*` credentials and one
`EMAIL_FROM`, used as the fallback for both platform and tenant mail.

`DEPLOYMENT_CHECKLIST.md` and `render.yaml` both provision the demo tenant
into the same database: `seed:demo` "creates or updates one explicitly tagged
disposable demo tenant", and the demo tenant is the one the 2026-09-08 release
record signs into *on production* to verify approvals.

---


Full finding text: INF-07 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/INF.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

Every operational finding above is amplified by this. INF-01's manual migration has no rehearsal target. INF-02's untested restore has nowhere safe to be tested. BUG-0899 (release chain always failed, production frozen 14 commits behind `main` for days) is the archetype: the failure was only discoverable in production because production is the only place the release chain runs. Live tenant email is also in scope — a test run against production sends real mail to real addresses.

## Affected Areas

docs/deployment

## Proposed Resolution

The cheap version is genuinely cheap and should be done before any of the expensive ones:
1. Create a Neon **branch** (`staging`) from production — Neon branches are copy-on-write and cost close to nothing — plus a second Render service on the free/starter tier pointed at it, with `PLATFORM_ENVIRONMENT=staging`, Stripe test keys and an SMTP sink. This gives the release chain, the migrations and the restore rehearsal a target. It is one service and one branch, not a platform.
2. Point Vercel *preview* deployments at that service (see INF-08).
3. Move the demo tenant to it once (1) exists.
Measurable trigger for anything larger: build a full pre-production replica when the platform has more than one paying tenant, or when a release first has to be scheduled around a customer's payroll date.

(Difficulty: MEDIUM; Regression risk: LOW; Fix now: LATER (but before the first paying customer))

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for whole estate (audit id INF-07).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: INF-07=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `INF-07` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/INF.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (INF-07) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
