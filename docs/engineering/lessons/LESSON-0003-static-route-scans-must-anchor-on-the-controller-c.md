---
id: LESSON-0003
status: PROPOSED
source: REVIEW
ref: scripts-lib-api-routes
rootCause: the first `export class` in a NestJS controller file is often a DTO, so a scanner that takes it as the controller misses class-level @UseGuards and reports every route unguarded
proposes: rule
created: 2026-11-02
---

# LESSON-0003 — Static route scans must anchor on the controller class not the first class

## Evidence

First scan of `attendance-operations.controller.ts` and `settings-context.controller.ts` reported 20 unguarded routes; both declare `@UseGuards(JwtAuthGuard, PermissionsGuard)` on the controller class after earlier DTO classes. Fixed by anchoring on `@Controller(`.

## Proposed change

Keep the anchoring and the zero-unguarded invariant in `scripts/lib/api-routes.mjs`; a regression fixture for a DTO-first controller file belongs in the scanner tests (not yet written).

## Why this is not already covered

The scanner has no unit tests of its own; it is exercised only through the gate.
