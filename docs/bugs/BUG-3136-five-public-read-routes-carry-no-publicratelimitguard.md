---
ID: BUG-3136
aliases: [BUG-3136]
Title: Five public read routes carry no PublicRateLimitGuard
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: SECURITY
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: a800d8f2
AffectedModules: [services/api/src/common]
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

# BUG-3136 — Five public read routes carry no PublicRateLimitGuard

## Summary

Five public read routes carry no PublicRateLimitGuard

Identified by the 2026-09-10 full technical audit as AUTHZ-07 (confidence: AUTHZ-07=CONFIRMED).

## Expected Behavior

Per AGENTS.md's own Security table, every `@Public()` handler needs `PublicRateLimitGuard`.

## Actual Behavior

These five routes can be called at unlimited rate by an unauthenticated caller. `public-tenants.controller.ts:resolve` accepts `slug`/`domain`/`host`/`tenantCode` query parameters and returns whatever `publicTenantsService.resolve` resolves; `getBrandingAsset` streams a file by `tenantSlug` + `assetType`.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**AUTHZ-07** (modules/tenants/public-tenants.controller.ts:18-19,34-35 (resolve, getBrandingAsset — no @UseGuards on the controller at all), modules/tenant-domains/workspace.controller.ts:17-32 (resolve — class has no @UseGuards, and only /mine gets @UseGuards(JwtAuthGuard) at method level), modules/tenant-settings/tenant-branding.controller.ts:23-30 (resolved — class-level guards are JwtAuthGuard, PermissionsGuard, both bypassed by @Public(), no PublicRateLimitGuard added back), modules/tenant-settings/tenant-settings.controller.ts:90-93 (public-branding, same pattern)):

`modules/tenants/public-tenants.controller.ts:18-19,34-35` (`resolve`, `getBrandingAsset` — no `@UseGuards` on the controller at all), `modules/tenant-domains/workspace.controller.ts:17-32` (`resolve` — class has no `@UseGuards`, and only `/mine` gets `@UseGuards(JwtAuthGuard)` at method level), `modules/tenant-settings/tenant-branding.controller.ts:23-30` (`resolved` — class-level guards are `JwtAuthGuard, PermissionsGuard`, both bypassed by `@Public()`, no `PublicRateLimitGuard` added back), `modules/tenant-settings/tenant-settings.controller.ts:90-93` (`public-branding`, same pattern).

---


Full finding text: AUTHZ-07 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTHZ.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

Unthrottled tenant-slug/domain enumeration and unthrottled asset serving. Low data sensitivity (these are explicitly public-facing branding and routing endpoints, not tenant business data), but real load/enumeration exposure, and a direct, citable violation of the project's own stated rule for `@Public()` routes — the kind of gap this project has repeatedly had to fix elsewhere (see the four cited sibling `BUG-00xx` records).

## Affected Areas

services/api/src/common

## Proposed Resolution

Add `@UseGuards(PublicRateLimitGuard)` (controller-level, matching `public-billing.controller.ts`'s pattern) to `PublicTenantsController`, `WorkspaceController`, and the two `resolved`/`public-branding` methods (or their controllers, if nothing else on those controllers needs to stay unthrottled-by-guard).

(Difficulty: LOW; Regression risk: LOW; Fix now: LATER (real but low-severity; batch with other public-endpoint hardening))

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for modules/tenants/public-tenants.controller.ts:18-19,34-35 (resolve, getBrandingAsset — no @UseGuards on the controller at all), modules/tenant-domains/workspace.controller.ts:17-32 (resolve — class has no @UseGuards, and only /mine gets @UseGuards(JwtAuthGuard) at method level), modules/tenant-settings/tenant-branding.controller.ts:23-30 (resolved — class-level guards are JwtAuthGuard, PermissionsGuard, both bypassed by @Public(), no PublicRateLimitGuard added back), modules/tenant-settings/tenant-settings.controller.ts:90-93 (public-branding, same pattern) (audit id AUTHZ-07).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: AUTHZ-07=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `AUTHZ-07` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTHZ.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (AUTHZ-07) at `a800d8f2`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
