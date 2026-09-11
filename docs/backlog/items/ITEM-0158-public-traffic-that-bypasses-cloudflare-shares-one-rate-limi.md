---
ID: ITEM-0158
aliases: [ITEM-0158]
Title: Public traffic that bypasses Cloudflare shares one rate-limit bucket, by design and untested
Type: INFRA
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [pkg:config, services/api/src/common/security]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-11
RelatedBug: BUG-3254
RelatedQA:
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0158 — Public traffic that bypasses Cloudflare shares one rate-limit bucket, by design and untested

> **Architect triage, 2026-09-11 — `PLAN_REQUIRED`.** The trade-off here is
> correct as it stands and must not be changed by editing a boundary condition —
> [[BUG-3254]] is what happens when somebody tries. What is missing is a measured
> answer to how often the unattributed path is actually taken, and that needs
> observability this platform does not yet have.

## Summary

`readForwardedForClientIp` accepts a forwarded chain only when it has strictly
more entries than the trusted hop count, so that every position it reads has a
trusted hop's append to its right. That is the right call: the API is directly
reachable (INF-06), so a chain of exactly `hopCount` entries could have been
produced by an attacker bypassing Cloudflare, and reading it would hand them one
fresh identity per request.

The cost is that any honest request which reaches the service **without passing
every configured hop** resolves to `null`, and `resolveClientIp` then answers
`'unknown'`. The public write limiter keys on `resolveClientIp(request) + path`,
so all such callers share a single bucket: twenty writes exhaust the ten-minute
window for every one of them.

In the normal path this never happens, because `cf-connecting-ip` is preferred
and Cloudflare sets it unconditionally. The question this item exists to answer is
how much traffic is *not* in the normal path.

## Why It Matters

Three ways the unattributed path gets taken, in rough order of likelihood:

- **The service URL directly.** `dijipeople.onrender.com` serves the same API as
  `api.dijipeople.com`, with no Cloudflare in front and therefore no
  `cf-connecting-ip`. Anything pointed at it — a misconfigured integration, a
  copy-pasted link, a partner's script — lands in the shared bucket and can lock
  out every other caller doing the same.
- **A hop count that does not match the topology.** `TRUST_PROXY_HEADERS` is unset
  on the live service, so the value is inferred: `RENDER === 'true'` yields **1**.
  But the real chain for a Cloudflare-fronted request is visitor then edge, which
  is two hops. The inference is one short. `cf-connecting-ip` covers for it today,
  which is exactly what makes the mismatch invisible.
- **Any future surface without Cloudflare.** A staging environment, a second
  region, an internal caller.

None of this is currently observable. There is no metric for how many requests
resolve to `'unknown'`, no alert when a public window is exhausted, and no log
line that distinguishes "throttled because this caller was noisy" from "throttled
because nobody could be identified". A support report would read as "the subscribe
form rejects everyone", with nothing to confirm it.

## Evidence

- `packages/config/client-ip.js` — the `entries.length <= hops` guard and the
  comment explaining why it is strict.
- `services/api/src/common/security/client-ip.ts` — turns `null` into `'unknown'`
  deliberately, so callers cannot collapse into a bucket keyed on `undefined`.
- `packages/config/forwarded-host.js` — `resolveTrustProxySetting` returns 1 for
  Render, not 2.
- INF-06 in the 2026-09-10 audit: the API is reachable at its Render hostname as
  well as through Cloudflare.
- `docs/deployment/platform-access.md`: `TRUST_PROXY_HEADERS` is not among the
  variables set on the live service.

## Proposed Approach

In order, because the first step decides whether the rest is worth doing.

1. **Measure it.** Count requests whose client cannot be attributed, split by
   path and by whether `cf-connecting-ip` was present. Until that number is
   known, every remedy below is a guess. This depends on there being somewhere to
   send a metric, which is [[ITEM-0009]].
2. **Set `TRUST_PROXY_HEADERS` explicitly to the true hop count** rather than
   relying on the Render inference, so the chain path is correct on its own terms
   instead of being carried by `cf-connecting-ip`. This is an environment-variable
   write on a production service and needs the owner's hand.
3. **Decide what an unattributable public write should get.** Sharing one bucket
   is one answer; a much tighter per-bucket limit for unattributed traffic is
   another, and refusing it outright is a third. This is the part that needs a
   decision rather than an implementation.
4. **Close the bypass at the edge** if the measurement says the direct hostname
   carries real traffic: restrict the Render URL to Cloudflare's ranges, which
   removes the whole class rather than tuning it.

## What this item must NOT do

Relax the hop guard. It reads like an off-by-one and is not, and changing it
reopens RATE-01. [[BUG-3254]] records the full argument, including the reasoning
that made the change look correct.

## Notes

This item exists because a misdiagnosis surfaced a real question. The availability
cost was reasoned about while trying to justify relaxing the guard, and the
reasoning was wrong about the remedy while being right that the cost exists. Worth
separating: a bad fix can still be evidence of a genuine problem, and discarding
the observation along with the patch loses the useful half.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-3254]]
- Modules — [[deployment-architecture]]

<!-- GRAPH:END -->
