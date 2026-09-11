---
ID: BUG-3254
aliases: [BUG-3254]
Title: The rate-limit e2e suite sent a forwarded chain one hop short, and the guard was misread as an off-by-one
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: TEST_GAP
Source: QA_RUN
DetectedDate: 2026-09-11
DetectedInSha: 1473af92
AffectedModules: [pkg:config, services/api/src/common/security, services/api/test]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-409
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-11
ResolvedAt: 2026-09-11
---

# BUG-3254 — The rate-limit e2e suite sent a forwarded chain one hop short, and the guard was misread as an off-by-one

> **Architect triage, 2026-09-11 — `DONE`.** This record was first written
> claiming the opposite of what is true, and is kept rather than deleted because
> the mistake is the lesson. The title, severity and type were all changed once
> the evidence was read properly: it is a MEDIUM test defect, not a HIGH security
> regression, and the library it accused was correct throughout.

## Summary

The RATE-01 hardening made `readForwardedForClientIp` read the client from a
fixed distance from the right of `X-Forwarded-For`, refusing any chain that does
not have **strictly more** entries than the trusted hop count. The rate-limit e2e
suite trusts one hop and sent a one-entry chain, which is therefore refused, so
every caller resolved to the same fallback identity and the cross-address
assertion failed.

The fix is one line in the test: send a chain of realistic length.

## What was originally recorded here, and why it was wrong

The first version of this record said the guard was an off-by-one that
reintroduced a denial of service, and the guard was relaxed from
`entries.length <= hopCount` to `entries.length < hopCount` on this reasoning:

> A proxy appends the peer it received from, so an honest chain carries exactly
> `hopCount` entries. Rejecting those rejects every real visitor.

The first sentence is true. The conclusion does not follow, and CI said so
immediately: `services/api/src/common/security/client-ip.spec.ts` failed on two
assertions that exist precisely to pin this boundary.

The missing fact is INF-06 — **the API is directly reachable**, so Cloudflare can
be bypassed. With two hops configured, a caller who goes straight to Render and
sends one forged entry produces `<forged>, <render-peer>`: two entries, the same
length as an honest Cloudflare-then-Render chain. `entries[length - hops]` then
reads the forged value. Accepting a chain of exactly `hopCount` hands the
attacker an identity per request, which is the RATE-01 bypass the function exists
to close.

So the strict boundary is deliberate. Its cost is real and accepted: honest
traffic that reaches the service without passing every configured hop resolves to
`null`, and the caller keys it on something it independently trusts.
`cf-connecting-ip` is preferred above the chain for exactly that reason —
Cloudflare overwrites it and a caller cannot.

## Expected Behavior

A test that configures N trusted hops sends a chain of at least N+1 entries, the
shape a real request has. The library refuses anything shorter, and keeps
refusing it.

## Actual Behavior

The suite set `TRUST_PROXY_HEADERS = 'true'` (one hop) and sent
`x-forwarded-for: 203.0.113.12` — one entry. Every caller resolved to `'unknown'`,
so the noisy visitor and the quiet one shared a bucket and the quiet one received
`429`.

## Reproduction

CI run `34545828468`, job `Database e2e`:
`public-rate-limit.e2e-spec.ts › does not leak the throttle across addresses`,
`Expected: not 429`. 407 of 408 e2e tests passed.

## Evidence

- The suite's own helper set a single-entry header while trusting one hop.
- `client-ip.spec.ts` asserts a one-entry chain at one hop is `'unknown'`, and a
  two-entry chain at two hops resolves to neither the leftmost entry nor the
  socket address. Both are stated with their security rationale.
- CI run `34548046363` failed those two assertions the moment the guard was
  relaxed — the library's own tests caught the relaxation within one push.

## Root Cause

Two causes, and the second is the one worth carrying forward.

The proximate cause is the test: its header shape was updated for the new parsing
behaviour without matching the chain length to the hop count it configures. Its
comment shows the partial update — it explains why the value must be a real
dotted address, and says nothing about how many entries are needed.

The deeper cause is that a red test was diagnosed as a defect in the code it
exercised rather than in its own setup. The guard reads like an off-by-one in
isolation; it is only correct in light of a fact recorded elsewhere (INF-06), and
that fact was not consulted before changing a security boundary. The library had
no unit test of its own to make the intent visible at the point of change, which
is what made the misreading easy.

## Impact

None shipped. The relaxation existed on a branch for one CI cycle and was caught
by the API unit suite before any merge. Had it merged, it would have reopened the
RATE-01 bypass on the directly-reachable service URL: a caller could mint one
identity per request and never be throttled.

The availability concern that motivated the mistake is genuine but separate, and
is recorded as [[ITEM-0158]] rather than fixed here.

## Affected Areas

- `services/api/test/public-rate-limit.e2e-spec.ts` — the chain shape
- `packages/config/client-ip.js` — comment only; the logic is unchanged
- `packages/config/client-ip.test.js` — new

## Proposed Resolution

Send `client-supplied, <caller>` from the e2e helper: one entry standing in for
whatever a caller might put on the left, and the per-caller address where the
trusted hop's append belongs. Restore the guard. Give the library the unit tests
that would have made its intent obvious.

## Acceptance Criteria

- The rate-limit e2e suite passes, including the cross-address assertion.
- `client-ip.spec.ts` passes unchanged — it was never wrong.
- The strict boundary is pinned by tests in the package that owns it.
- The comment explains why the boundary is not an off-by-one, so the next reader
  does not repeat this.

## Regression Coverage

REG-409. `packages/config/client-ip.test.js`, wired as `npm run test:client-ip`
and added to the required gate. Its central case is
`a chain of exactly the hop count vouches for nothing`, which fails if the guard
is relaxed again.

The script also runs `packages/config/forwarded-host.test.js`, which existed but
was referenced by no script and no CI job — 14 tests that had never executed once.

## Dependencies

None. `BUG-3115`, the RATE-01 bypass fix, stands unmodified.

## Related Items

- [[BUG-3115]] — the hardening whose boundary this misread
- [[ITEM-0158]] — the availability cost of the strict boundary, recorded not fixed
- [[BUG-0032]] — the original per-address limiter defect
- RATE-01 and INF-06 in the 2026-09-10 technical audit

## Resolution

Guard restored to `entries.length <= hops`. The e2e helper now sends a chain one
entry longer than the trusted hop count. Six of six e2e tests pass locally against
a throwaway database, and the full API unit suite passes at 6566 tests in 322
suites — the suite that was not re-run after the library change, which is how the
relaxation reached CI at all.

## QA Retest

Continuous, through REG-409 and the e2e suite, both in CI.

## History

- 2026-09-11 — the rate-limit e2e suite failed on CI run `34545828468`.
- 2026-09-11 — misdiagnosed as an off-by-one in `readForwardedForClientIp`; the
  guard was relaxed and this record written asserting a denial of service.
- 2026-09-11 — CI run `34548046363` failed `client-ip.spec.ts` on two assertions.
  The guard was restored, the test fixed instead, and this record rewritten to say
  what actually happened.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0158]]
- Modules — [[deployment-architecture]]
- Regression — REG-409 (see the regression register)

<!-- GRAPH:END -->
