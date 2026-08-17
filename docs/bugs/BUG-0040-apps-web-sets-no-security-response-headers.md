---
ID: BUG-0040
aliases: [BUG-0040]
Title: apps/web sets no security response headers
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: SECURITY
Source: QA_RUN
DetectedDate: 2026-08-17
DetectedInSha: 1af3690
AffectedModules: [apps/web]
OwnerAgent: frontend
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-17-web-app-documentation-1af3690.md
RegressionId: REG-035
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
ResolvedAt: 2026-08-17
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

Fixed for **all three** Next apps, not only the tenant product this record
named — `apps/admin` and `apps/landing` shipped no headers either, and three
copies of a header policy drift invisibly.

Defined once in `packages/config/security-headers.js` and applied through each
app's `next.config.ts`:

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Frame-Options` | `DENY` |
| `Permissions-Policy` | camera, microphone, geolocation, payment all `()` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` |
| `Content-Security-Policy-Report-Only` | see below |

**The CSP ships Report-Only, deliberately, and that is the part worth reading.**

A CSP is the one header here that can break a working product: a directive
slightly too tight blanks a page, and Next.js emits inline bootstrap script and
inline styles whose exact shape depends on the build. I cannot observe a real
browser against this build from here. Shipping an enforced policy that has never
been evaluated in one would trade a missing header for an outage on the product
that renders payroll and bank details.

Report-Only is the standard rollout: the browser evaluates the policy, reports
what *would* have been blocked, and changes nothing. Promotion to enforced is a
deliberate follow-up once reports show it clean — [[ITEM-0039]].

**Clickjacking protection is not deferred with it.** `X-Frame-Options: DENY` is
enforced immediately, because it cannot break a page the way a script directive
can, and framing the tenant product was the sharpest risk in this record.

The other five headers are all statements about how the browser should treat a
response we already control, rather than restrictions on what a page may load,
so none of them can reject a legitimate resource.

## QA Retest

`npm run test:security-headers` — 6 assertions, all passing. Two of them exist
specifically to stop the decisions above being undone by accident: the CSP is
Report-Only and **not** enforced, and `X-Frame-Options` is `DENY`.

Typecheck clean for `web`, `admin` and `landing`. `apps/web` suite 391
tests passing.

## History

- 2026-08-17 — Architect reconciliation: terminal `VERIFIED` status normalized
  to `ArchitectDisposition: DONE`; the existing resolution and QA evidence are
  unchanged.

- 2026-08-17 — found during the `apps/web` deep documentation audit (TASK-0003).
- 2026-08-17 — Architect triage: `FIX_NOW` for the framing/sniffing/referrer
  headers, which are unambiguous and low-risk. CSP is explicitly carved out as a
  separate change so this record does not stall on it.
- 2026-08-17 — fixed and verified during the final parent implementation phase.
