---
ID: BUG-0040
aliases: [BUG-0040]
Title: apps/web sets no security response headers
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: SECURITY
Source: QA_RUN
DetectedDate: 2026-08-17
DetectedInSha: 1af3690
AffectedModules: [apps/web]
OwnerAgent: frontend
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-17-web-app-documentation-1af3690.md
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
ResolvedAt:
---

# BUG-0040 — apps/web sets no security response headers

## Summary

The tenant product ships **no `Content-Security-Policy`, no `X-Frame-Options` /
`frame-ancestors`, no `Strict-Transport-Security`, no `X-Content-Type-Options`
and no `Referrer-Policy`.** `next.config.ts` defines no `headers()` function and
`proxy.ts` sets no response security headers across its 611 lines.

## Expected Behavior

An authenticated product handling payroll and bank details is not framable by an
arbitrary origin, and declares a content policy.

## Actual Behavior

Every response carries only Next's defaults. The application can be embedded in
an iframe on any site, which is the precondition for clickjacking against its
governed actions — approve, reverse a payroll run, delete.

## Reproduction

1. `grep -n "headers" apps/web/next.config.ts` → no `headers()` function.
2. Request any authenticated page and inspect response headers.

## Evidence

- `apps/web/next.config.ts` — 139 lines, read in full. It sets exactly two
  things: `poweredByHeader: false` and a conditional `output: "standalone"`,
  plus 55 settings redirects. **No `headers()`, no `images`, no `rewrites`.**
- `apps/web/proxy.ts` — 611 lines. Sets workspace headers on the *request*
  (`workspaceHeaders`) and never sets a response security header.
- Nothing at the platform layer compensates that is readable from the
  repository: there is no `vercel.json` and `render.yaml` defines only the API
  service.

## Root Cause

Established: never configured. Next.js sets no security headers by default, and
nothing in CI checks for them — the `test-runtime` job's four static checks
cover loopback URLs, client-IP forwarding, native prompts and app URLs.

## Impact

Reachable in production by anyone who can get a user to load a page they
control. Clickjacking against a payroll approval is the concrete scenario. The
absent CSP also removes the second line of defence against an injected script,
though `apps/web` has exactly one `dangerouslySetInnerHTML` and it is a static
template (`app/layout.tsx:78`), so XSS surface is genuinely small today.

`MEDIUM` rather than `HIGH`: no known injection point, and exploitation needs
user interaction.

## Affected Areas

Every response from `apps/web`. `apps/admin` and `apps/landing` should be
checked for the same gap — not done here, as they are outside this task's scope.

## Proposed Resolution

Add a `headers()` block to `next.config.ts` covering `X-Frame-Options: DENY` (or
CSP `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin` and `Strict-Transport-Security`.

A CSP needs care rather than a one-liner: `app/layout.tsx:78` runs an inline
theme-bootstrap script, so a `script-src` without a nonce or hash will break
first paint. Ship the framing and sniffing headers first — they are unambiguous
— and treat CSP as its own change with a report-only rollout.

## Acceptance Criteria

- Responses carry framing, sniffing and referrer headers.
- The theme bootstrap still runs under whatever `script-src` is chosen.
- A check fails if the headers block is removed.

## Regression Coverage

**None.** A static check that `next.config.ts` exports `headers()` would be
cheap and in the established style of the four existing `scripts/check-*.mjs`.

## Dependencies

None.

## Related Items

[[web-architecture]] · [[tenant-application]] ·
[[BUG-0041-web-route-proxies-make-authorization-and-business-decisions]].

## Resolution

Not resolved.

## QA Retest

Not applicable — not yet fixed. Verified by reading `next.config.ts` and
`proxy.ts` in full at `1af3690`. **No response was inspected from a running
server**, so a header injected by the hosting platform is not excluded — and
since no deployment configuration is in the repository, that cannot be settled
from here.

## History

- 2026-08-17 — found during the `apps/web` deep documentation audit (TASK-0003).
- 2026-08-17 — Architect triage: `FIX_NOW` for the framing/sniffing/referrer
  headers, which are unambiguous and low-risk. CSP is explicitly carved out as a
  separate change so this record does not stall on it.
</content>
