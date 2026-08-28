---
ID: BUG-1424
aliases: [BUG-1424]
Title: The admin console serves no Content-Security-Policy header
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: SECURITY
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 8d6be21b
AffectedModules: [apps/admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-26-admin-prod-e2e-8d6be21.md
RegressionId: REG-295
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-28
ResolvedAt: 2026-08-28
---

# BUG-1424 — The admin console serves no Content-Security-Policy header

> **Architect triage, 2026-08-27 — `PLAN_REQUIRED`.** A Content-Security-Policy is an architecture decision with a real breakage surface. ExecPlan.


## Summary

`admin.dijipeople.com` sends every other security header the platform should
send — HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`
— and no `Content-Security-Policy` at all. Nothing in `apps/admin` configures
one.

The console is the highest-blast-radius surface in the product: it reads across
every tenant, and it renders operator-supplied and customer-supplied strings
(lead names, company names, support case bodies, contract content). CSP is the
control that limits what an injected script could do if any of those escaped
escaping. It is the one layer of that defence that is entirely absent.

## Expected Behavior

The admin console serves a `Content-Security-Policy` restricting at minimum
`script-src`, `object-src` and `base-uri`, so that a successful injection cannot
load or exfiltrate to an arbitrary origin.

## Actual Behavior

The header is absent on every response.

## Reproduction

```bash
curl -sI https://admin.dijipeople.com/tenants | grep -i "content-security-policy"
# no output
```

Observed, 2026-08-26 against `8d6be21b`, over a signed-in navigation to
`/tenants`:

```
PASS  header strict-transport-security — max-age=63072000; includeSubDomains
PASS  header x-content-type-options     — nosniff
PASS  header x-frame-options            — DENY
FAIL  header content-security-policy    — ABSENT
PASS  header referrer-policy            — strict-origin-when-cross-origin
PASS  no x-powered-by disclosure
```

## Evidence

No configuration exists to produce one. Searching `apps/admin/next.config.*`,
`apps/admin/middleware.ts` and `services/api/src/main.ts` for
`Content-Security-Policy`, `contentSecurityPolicy` or `helmet` returns nothing.
The other headers are present, so this is an omission in an otherwise
deliberate set rather than a stripped response.

## Root Cause

Not established. The presence of the other four headers suggests the header set
was configured once without CSP — plausibly because CSP needs per-app tuning
(Next.js inline bootstrap scripts need either a nonce or `strict-dynamic`) and
the rest did not.

## Impact

Production, the whole admin console. This is defence in depth, not a live
vulnerability: no XSS was found during this run, and the app escapes by default
through React. The exposure is that **if** a sink is ever missed, nothing limits
what the injected script may load or where it may send what it reads — and what
it can read here is cross-tenant.

Rated MEDIUM on that basis: no reachable exploit today, high consequence on the
surface where it is missing.

## Affected Areas

- `apps/admin` — every response
- `apps/admin/next.config.ts` / `middleware.ts`, wherever the existing header
  set is defined

## Proposed Resolution

Add a CSP to the admin app alongside the headers it already sets. Next.js needs
a nonce or hash strategy for its bootstrap scripts, so this is worth doing in
report-only mode first (`Content-Security-Policy-Report-Only`) to find what the
console actually loads before enforcing.

Check `apps/web` and `apps/landing` in the same pass — this run only covered
admin, and the header is very likely absent there too. Do not assume it; measure
it.

## Acceptance Criteria

- `admin.dijipeople.com` serves a `Content-Security-Policy` on every response.
- The policy constrains `script-src`, `object-src` and `base-uri`.
- The console works with the policy enforced — no functionality relies on what
  the policy forbids.
- A test fails if the header is dropped.

## Regression Coverage

Needed: an assertion over the admin app's response headers covering the full
expected set, so a future header change cannot silently drop one. It would also
have caught this omission when the other four were added.

## Dependencies

None.

## Related Items

- [[BUG-1421]] — admin shell defects found in the same run
- [[BUG-1425]] — value validation gap found in the same run

## Resolution

**The premise is stale.** Measured against production on 2026-08-28: all three
apps serve a Content-Security-Policy.

```
curl -sI https://admin.dijipeople.com/  | grep -i content-security-policy
curl -sI https://app.dijipeople.com/    | grep -i content-security-policy
curl -sI https://www.dijipeople.com/    | grep -i content-security-policy
```

Each returns a `Content-Security-Policy-Report-Only` header with
`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'` and the
rest. `apps/admin/next.config` calls `securityHeadersForApp` from
`packages/config`, as do web and landing — so this record's "Nothing in
`apps/admin` configures one" no longer holds. It was addressed by BUG-0040,
which this module's own type declarations reference.

Report-only is where this record's proposed resolution says to start, and that
is where it is.

**What the measurement did turn up** is filed as [[BUG-1822]]: the landing
site's CSP permits the API over `http://` while the other two use `https://`,
so its `connect-src` matches nothing a browser on an HTTPS page could reach.
Harmless while report-only; a live break for checkout the moment anyone
enforces.

A guard was added for that class: `securityHeadersForApp` now refuses a
non-loopback `http://` API origin at build time rather than shipping a policy
that cannot work — the same stance `packages/config` already takes on loopback
URLs reaching production.

**Still open, and the substance of this record's concern:** the policy is
report-only and its `script-src` carries `'unsafe-inline'`, which Next's inline
bootstrap requires and which defeats much of the protection. Moving to a nonce
and then to enforcement is real work with a real chance of breaking the console,
and it wants its own record rather than being closed silently here.

## QA Retest

Verified by measurement on 2026-08-28 against production commit `e0aeabcd` —
the header is present on all three apps, which is what this record says is
missing.

`packages/config/security-headers.test.js` covers the policy's shape.

The remaining work is not a retest: it is deciding whether to adopt a nonce
strategy and enforce. Until then a report-only policy with `'unsafe-inline'` is
a monitoring tool rather than a control, and should be described as one.

## History

- 2026-08-26 — created from qa run at `8d6be21b`.
- 2026-08-28 - premise measured stale: all three apps serve a report-only CSP. The measurement found BUG-1822 instead, and a build-time guard was added for that class. Enforcement and 'unsafe-inline' remain open.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]]
- Regression — REG-295 (see the regression register)

<!-- GRAPH:END -->
