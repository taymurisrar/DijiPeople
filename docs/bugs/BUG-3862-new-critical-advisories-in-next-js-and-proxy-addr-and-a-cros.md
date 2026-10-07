---
ID: BUG-3862
aliases: [BUG-3862]
Title: New critical advisories in Next.js and proxy-addr, and a cross-tenant nodemailer advisory, block every develop integration
Status: FIXED
Severity: CRITICAL
Priority: P0
Type: SECURITY
Source: REVIEWER
DetectedDate: 2026-10-07
DetectedInSha: 9714f85b
AffectedModules: [apps/web, apps/admin, apps/landing, notifications]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-646
RelatedBacklogItem: ITEM-0123
RelatedDecision:
RelatedImplementation: [package-lock.json, scripts/check-production-advisories.mjs, services/api/package.json]
CreatedAt: 2026-10-07
UpdatedAt: 2026-10-07
ResolvedAt: 2026-10-07
---

# BUG-3862 — New critical advisories in Next.js and proxy-addr, and a cross-tenant nodemailer advisory, block every develop integration

## Summary

The repository did not change, but the advisory feed did. On 2026-10-07 it
began listing 20 production advisories against the committed lockfile. Two were
critical, and the "Runtime schema tests" job's production-advisory check
failed. That turned the CI required gate red for every branch, so nothing could
integrate into `develop`. Every one of these versions is also what production
runs today.

## Expected Behavior

No critical advisory in the production dependency graph. Every surviving high or
moderate advisory carries a written, auditable disposition
(`scripts/check-production-advisories.mjs`).

## Actual Behavior

| Package | Severity | Advisory |
|---|---|---|
| `next` 16.3.4 | CRITICAL | Remote code execution in next/og ImageResponse (GHSA-vcvr-r3jv-pc5j). Fixed in 16.3.6. |
| `proxy-addr` 2.0.7 | CRITICAL | IP spoofing through an IPv4-mapped IPv6 trust subnet (GHSA-jqcg-44mw-7w3h). This is Express's trust-proxy path, which client-IP rate limiting depends on. |
| `nodemailer` 9.1.1 | HIGH | A process-global DNS cache reuses the TLS `servername` across transports, so cross-tenant SMTP credentials can be disclosed (GHSA-6vj9-mwq6-2f5v). It also has four DoS advisories. This product runs one transport per tenant email provider. |
| `multer` 2.2.0 / `@nestjs/platform-express` | HIGH | A new orphaned-disk-write DoS (GHSA-3pph-fpjx-jg34) and a file-size-limit bypass (GHSA-qvfw-j98x-7q72), on top of the three ITEM-0123 had accepted. |

Also flagged:

- **High:** `brace-expansion`, `http-cache-semantics`, `sharp` (librsvg) and `source-map-js`.
- **Moderate:** `fast-uri` and `ip-address`.
- **Moderate, with no fix:** `mammoth`, `argparse` and `sprintf-js`, which form one chain.

## Reproduction

At `9714f85b`, run `node scripts/check-production-advisories.mjs`. It exits 1 and
names `next` and `proxy-addr` as critical, plus 10 advisories that have no
disposition. CI run 37591991509 (on branch `agent/crm-plugin-alm-mfa-claims`)
failed for this reason alone. `develop` at the same SHA had passed hours
earlier.

## Evidence

- The `npm audit --omit=dev --json` output is summarised in the table above.
- `node scripts/check-production-advisories.mjs` gives the same result on
  unmodified `develop` in the primary checkout, so no diff caused it.

## Root Cause

New advisories were published against dependency versions that had been safe
when they were locked. The check exists for exactly this; it is the failure
working as intended.

## Impact

- Production is exposed until the fix is released to `main`:
  - the Next RCE affects the three Next apps;
  - the proxy-addr spoofing affects the API's client-IP decisions;
  - the nodemailer flaw risks cross-tenant SMTP credential disclosure.
- In the meantime, every `develop` integration is blocked.

## Affected Areas

`apps/web`, `apps/admin`, `apps/landing` and `apps/docs` (Next); `services/api`
(Express trust proxy, multipart uploads, tenant email).

## Proposed Resolution

Upgrade within semver where a fix exists. Write a call-site-level disposition
where none exists. Do not regenerate the lockfile: ITEM-0123 records that doing
so churned 294 versions and introduced a new critical.

## Acceptance Criteria

- `node scripts/check-production-advisories.mjs` reports 0 critical and 0
  undocumented advisories.
- The lockfile diff changes only the targeted packages.
- The API typechecks and its tests pass.
- web, admin and landing build.

## Regression Coverage

REG-646: `scripts/check-production-advisories.mjs`, run by CI on every push.

## Dependencies

None.

## Related Items

[[ITEM-0123]] tracked the multer pin. Its removal trigger fired with this fix.

## Resolution

Upgrades:

| Package | From | To |
|---|---|---|
| `next` (all four apps) | 16.3.4 | 16.3.8. Pinned in the lock to stay on the 16.3 line; `^` would have taken 16.4.0. |
| `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express` | 11.1.x | 11.2.7, which brings multer 2.4.0 |
| `nodemailer` | 9.1.1 | 10.0.15. Its only breaking change is Node ≥ 20; this product runs Node 22. |

Transitive updates within their existing ranges:

- `proxy-addr` 2.0.8
- `sharp` 0.35.5
- `http-cache-semantics` 4.3.0
- `source-map-js` 1.2.2
- `fast-uri` 3.1.8
- `ip-address` 10.7.3
- `brace-expansion` 1.1.21 / 2.1.7 / 5.0.12

Six orphaned lockfile entries under `node_modules/cacache/node_modules/` were
removed. Their parent package no longer exists, so nothing installed them.

Disposition changes:

- The multer and `@nestjs/platform-express` dispositions were removed.
- Dispositions were added for `mammoth`, `argparse` and `sprintf-js`, naming
  their call sites. argparse is loaded only by mammoth's CLI, and sprintf-js
  has no fixed release.

Branch `agent/security-advisories-2026-10`.

## QA Retest

QA-PLATFORM-045: the advisory check passes, the API typecheck and tests pass,
and web, admin and landing build.

## History

- 2026-10-07 — found when CI blocked the CRM plugin integration. The owner
  chose to fix the advisories now; fixed the same day.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0123]]
- Modules — [[tenant-application]], [[platform-admin]], [[landing-architecture]], [[notifications]]
- Regression — REG-646 (see the regression register)

<!-- GRAPH:END -->
