---
ID: BUG-3355
aliases: [BUG-3355]
Title: A second sign-in silently destroys the first session, and the displaced browser is never told
Status: PRODUCT_DECISION
Severity: HIGH
Priority: P1
Type: BUG
Source: USER_REPORT
DetectedDate: 2026-09-11
DetectedInSha: 118d22ed
AffectedModules: [api:auth, web:auth]
OwnerAgent: architect
ArchitectDisposition: PRODUCT_DECISION
QAReport:
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-11
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3355 — A second sign-in silently destroys the first session, and the displaced browser is never told

## Summary

Signing in a second time as the same user on the same client revokes the first
session's refresh token immediately. That is a deliberate single-active-session
policy, but three things make it a defect rather than a control. The policy is
**on by default for every tenant that has never configured it** — the setting is
read as `setting?.value === true`, so an absent row means "one session only".
Nothing in the product surfaces or explains it. And the displaced browser is
never notified: it keeps its cookies, keeps rendering, and fails at some
arbitrary later moment with a message that says nothing about another sign-in.

The user who reported this had signed in with **Remember me** checked and was
signed out anyway. Remember me cannot survive this, because it lengthens a
token's lifetime and this is a revocation.

## Expected Behavior

Either of these would be defensible; the present behaviour is neither.

- Concurrent sessions are allowed by default, and a tenant that wants
  single-session opts into it explicitly.
- Or single-session remains the default, and it is *visible*: the setting is
  documented and surfaced in Security & Access, the sign-in screen warns that
  continuing will end other sessions, and the displaced browser is told what
  happened rather than being left to discover it.

In every case, a session that was ended by another sign-in must say so.

## Actual Behavior

`persistRefreshToken` runs on every login and on every rotation. Unless the
tenant has explicitly stored `allowMultipleActiveSessions: true`, it first
revokes **every other live refresh token for that user on that client**, then
writes the new one. The previously signed-in browser keeps a structurally valid
access JWT and a refresh cookie that are both now useless. It carries on until
its next authenticated call, which fails.

## Reproduction

1. Sign in to a tenant workspace as user U on the `web` client, with
   **Remember me** checked. Leave the tab open.
2. In a second browser, or through any automation driving the same app, sign in
   again as the same user U on the `web` client.
3. Read the `RefreshToken` rows for U: the first session's token now carries a
   `revokedAt` equal to the second session's `createdAt`, to the millisecond.
4. Return to the first tab and interact with any screen that loads data. It
   fails. The message does not mention the second sign-in — see [[BUG-3356]] for
   why it says "Access token is required" instead.

The tenant needs no special configuration for this; the default is enough.

## Evidence

Production, API commit `85c31d9d`, tenant `91ab031f-8fa2-48b9-b346-7cdf326571ef`,
user `e0302ffb-65cc-4549-9538-f3020facef5a`, read 2026-09-11T21:41Z.

Three successful `web` sign-ins in one day, all from one origin address:

```
AuditLog / AUTH_LOGIN_SUCCEEDED / entityType AUTH_LOGIN
  2026-09-11T09:14:28.553Z  client=web  session=44111375...
  2026-09-11T17:23:52.456Z  client=web  session=ea0eb28d...
  2026-09-11T18:08:33.668Z  client=web  session=a10b21bd...
```

The `RefreshToken` rows show each sign-in killing its predecessor within the
same millisecond:

```
created 17:07:54.044  session 44111375  revoked 17:23:52.435   <- killed by the 17:23:52 sign-in
created 17:23:52.448  session ea0eb28d  revoked 18:08:33.648   <- killed by the 18:08:33 sign-in
created 18:08:33.660  session a10b21bd  revoked 18:09:54.842   <- ordinary sign-out
```

After 18:09:54 there is no live refresh token and no further sign-in. The user
reported a failure at **21:24:24Z** — three hours and fourteen minutes later,
from a browser still holding cookies for a session revoked at 18:08:33.

The tenant has **zero** rows in `TenantSetting` for category `security`, so
every auth policy value in play is a code default, including this one:

- `services/api/src/modules/auth/auth.service.ts:1720-1733` —
  `allowsMultipleActiveSessions` returns `setting?.value === true`; an absent
  row is `false`.
- `services/api/src/modules/auth/auth.service.ts:1680-1697` — the revoke-all
  branch in `persistRefreshToken`, reached from both login and rotation.

## Root Cause

A security default was chosen in code and never given a surface. The read
`setting?.value === true` makes "not configured" mean "most restrictive", which
is a sound instinct for a permission and the wrong one for a session policy: the
restrictive reading here does not deny an action, it silently destroys work in
progress somewhere the actor cannot see.

The second half of the cause is that revocation is a one-way event. Nothing
propagates it to the displaced client, so the only way that browser learns its
session ended is by failing.

## Impact

Reachable in production and observed there. Any tenant user signed in on two
devices — a desktop and a laptop, an office machine and a phone, a browser and
an automated test — loses one of them without explanation. On an HR platform
this lands mid-form: the user is filling in a leave request or a payroll run and
the screen stops working.

It also makes every other session defect harder to diagnose, because the
symptom is indistinguishable from expiry. That is precisely what happened in the
report that produced this record: the user reasonably concluded their token had
expired minutes after sign-in, when it had been revoked hours earlier by a
second sign-in.

## Affected Areas

- `POST /api/auth/login` and the rotation path of `POST /api/auth/refresh`
- `services/api/src/modules/auth/auth.service.ts` — `persistRefreshToken`,
  `allowsMultipleActiveSessions`
- `apps/web` — every authenticated screen in the displaced browser
- `apps/admin` and `apps/agent-desktop` reach the same code on their own client
  ids

## Proposed Resolution

Three separable pieces; no ExecPlan needed for the first two.

1. **Decide the default explicitly and record it as an ADR.** If concurrent
   sessions should be allowed by default, invert the read so an absent setting
   means `true`. If not, keep it and go to 2.
2. **Surface it.** Add `allowMultipleActiveSessions` to the Security & Access
   settings catalog with copy that says what it does, and seed it so the value
   is a decision rather than an absence.
3. **Tell the displaced client.** The session row is already there to be read;
   a revoked session should produce a distinguishable reason on the next call,
   so the browser can say "you signed in somewhere else" instead of failing
   blankly. This depends on [[BUG-3356]], which is what currently discards the
   reason.

## Acceptance Criteria

- The behaviour of a tenant with no `security` settings row is documented and
  deliberate, with a test that pins it.
- A tenant admin can see and change the single-session policy from Security &
  Access.
- When a session is ended by another sign-in, the displaced browser shows a
  message naming that cause, not a generic auth failure.
- Signing in twice with **Remember me** does not silently invalidate the first
  session without any message.

## Regression Coverage

A spec that signs the same user in twice on `web` and asserts the first token's
state matches the configured policy, in both the configured and unconfigured
tenant cases. Registered as a regression entry once written.

## Dependencies

[[BUG-3356]] must be fixed for acceptance criterion 3 to be observable at all.

## Related Items

[[BUG-3356]] — the revocation is reported as a missing token, which is why this
took a database read to diagnose. [[BUG-3357]] — the other reason **Remember me**
does not do what its label promises. [[BUG-2506]] — the sibling case where
sign-out *failed* to revoke a token; this is the same table read the other way.
[[BUG-2547]] — a revoked session still answering on `/auth/me`.

## Resolution

Not yet fixed.

## QA Retest

Pending.

## History

- 2026-09-11 — created from a user report of an unexplained sign-out at
  `21:24:24Z`, confirmed against production audit and refresh-token rows at
  `118d22ed`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0162]]
- Modules — [[auth]]

<!-- GRAPH:END -->
