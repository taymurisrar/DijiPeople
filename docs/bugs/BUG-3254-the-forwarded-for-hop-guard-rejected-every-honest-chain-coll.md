---
ID: BUG-3254
aliases: [BUG-3254]
Title: The forwarded-for hop guard rejected every honest chain, collapsing all callers into one rate-limit bucket
Status: FIXED
Severity: HIGH
Priority: P1
Type: SECURITY
Source: QA_RUN
DetectedDate: 2026-09-11
DetectedInSha: 1473af92
AffectedModules: [pkg:config, services/api/src/common/security]
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

# BUG-3254 — The forwarded-for hop guard rejected every honest chain, collapsing all callers into one rate-limit bucket

> **Architect triage, 2026-09-11 — `DONE`.** Introduced and fixed inside the same
> session. Recorded rather than quietly corrected, because the shape is worth
> keeping: a security fix whose own off-by-one reinstated the denial of service it
> was written to prevent, in the one code path production happens to mask.

## Summary

The fix for RATE-01 stopped the rate limiter trusting a client-supplied
`X-Forwarded-For`, and read the client from a fixed distance from the right of the
chain instead. The indexing was correct. The guard in front of it was not:

```js
if (entries.length === 0 || entries.length <= hops) return null;
```

A proxy appends the peer it received from, so an honest chain carries exactly
`hopCount` entries: one trusted hop (Render alone) yields a one-entry chain that
*is* the visitor, and two (Cloudflare then Render) yield `visitor, cf-edge`. Both
satisfy `length === hops`, so both returned `null`.

`resolveClientIp` then answers `'unknown'` for every such request. The public
write limiter keys on `resolveClientIp(request) + path`, so every caller in the
world shared one bucket: the first twenty public writes against a path exhausted
the ten-minute window for everybody.

The condition was wrong in both directions at once. A chain carrying an
attacker's prepended entry is one longer, so it passed the guard and resolved,
while every legitimate visitor did not.

## Expected Behavior

An honest chain resolves to the visitor. A chain genuinely too short to contain
the configured number of hops resolves to `null`. Prepending entries changes
nothing, because the genuine value is indexed from the right.

## Actual Behavior

Measured directly against the shipped function:

```
null           hops=1 [203.0.113.7]                            honest, Render only
null           hops=2 [203.0.113.7, 172.16.0.1]                honest, CF + Render
203.0.113.7    hops=1 [1.2.3.4, 203.0.113.7]                   attacker prepended
203.0.113.7    hops=2 [1.2.3.4, 203.0.113.7, 172.16.0.1]       attacker prepended
```

The two honest shapes are the two that failed.

## Reproduction

```
node -e "const {readForwardedForClientIp}=require('./packages/config/client-ip.js');
console.log(readForwardedForClientIp('203.0.113.7', 1))"
```

Before the fix: `null`. After: `203.0.113.7`.

End to end, the symptom is the e2e assertion that caught it: exhaust the public
write window from one address, then submit once from a different address. The
second caller receives `429` because it is in the first caller's bucket.

## Evidence

- CI run `34545828468`, job `Database e2e`:
  `public-rate-limit.e2e-spec.ts › does not leak the throttle across addresses`
  — `Expected: not 429`. 407 of 408 e2e tests passed; this was the one.
- `packages/config/client-ip.js`, the guard quoted above.
- The suite already set `TRUST_PROXY_HEADERS = 'true'`, so hop resolution was
  working and trust was not the problem — which is what pointed at the
  arithmetic rather than the configuration.

## Root Cause

An off-by-one in a boundary condition, in a module that had **no unit test file
at all**. The index expression `entries[entries.length - hops]` and the guard
`entries.length <= hops` disagree about whether `hops` counts positions or
excess entries; the index was right and the guard was written as though the chain
needed a spare entry beyond the hops.

Two things let it through. The module was untested, so nothing pinned the four
chain shapes. And production masks it: `resolveClientIp` prefers
`cf-connecting-ip`, which Cloudflare always sets, so the broken path is only
reached where Cloudflare is absent — which includes the directly-reachable Render
URL (INF-06) and every non-Cloudflare deployment.

## Impact

A self-inflicted denial of service on every public write path, on any route that
does not arrive through Cloudflare: twenty requests exhaust the window for all
visitors for ten minutes. That is precisely the failure [[BUG-0032]] was about,
reintroduced by the fix for its sibling, and it would have read in production as
"the subscribe form is rejecting everyone" with no obvious cause.

No security weakening: the forged-header bypass RATE-01 described stayed closed
throughout. The defect is availability, not authorization.

## Affected Areas

- `packages/config/client-ip.js` — `readForwardedForClientIp`
- `services/api/src/common/security/client-ip.ts` — the caller that turns `null`
  into `'unknown'`
- every `@Public()` write behind `PublicRateLimitGuard`

## Proposed Resolution

Change the guard to `entries.length < hops`, and give the module the unit tests
it never had.

## Acceptance Criteria

- Both honest shapes resolve to the visitor; both attacker-prepended shapes
  resolve to the same visitor; a genuinely short chain resolves to `null`.
- The rate-limit e2e suite's cross-address assertion passes.
- The arithmetic is pinned by tests that run in CI.

## Regression Coverage

REG-409. `packages/config/client-ip.test.js`, ten cases covering all four chain
shapes, the too-short case, absent and malformed headers, array headers, IPv6
bracketing, and hop-count defaulting.

Wired as `npm run test:client-ip` and added to the `Framework validation` job.
The script deliberately also runs `packages/config/forwarded-host.test.js`, which
existed but was referenced by no script and no job — it had never executed once.
A test nobody runs is not coverage, and that is how a module this sensitive came
to have none.

## Dependencies

None. Same code path as BUG-3115 (the forged-header bypass), which stays fixed.

## Related Items

- [[BUG-0032]] — the original "one address locks out everybody", from the other
  direction
- [[BUG-3115]] — the RATE-01 bypass fix that introduced this
- RATE-01, INF-06 in the 2026-09-10 technical audit

## Resolution

Guard changed to `entries.length < hops`. All five shapes verified before and
after. `public-rate-limit.e2e-spec.ts` passes locally against a throwaway
database: 6 tests, having failed 1 of 6 on CI.

The comment above the function now explains the arithmetic and names the
inversion, because "index from the right by the hop count" is easy to re-derive
wrongly and the wrong version fails in the direction nobody tests.

## QA Retest

Covered by REG-409's unit cases and the e2e suite. Both run in CI, so the retest
is continuous rather than a one-off pass.

## History

- 2026-09-11 — introduced by the RATE-01 hardening earlier in SESSION-0098.
- 2026-09-11 — caught by CI run `34545828468` on the integrated branch, not by
  any local run: the e2e job needs a database and had not been executed locally.
- 2026-09-11 — fixed, unit-tested, and the test wired into the required gate.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[deployment-architecture]]
- Regression — REG-409 (see the regression register)

<!-- GRAPH:END -->
