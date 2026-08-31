# Bug pattern — `stale-read-model-of-a-write-rule`

**A rule is added to a write path. Every read model that describes that write
path is now stale, and nothing says so.**

The close relative is
[`divergent-duplicate-guard`](divergent-duplicate-guard.md), where two copies of
a rule drift and the stale copy is the one actually enforced. Here the stale copy
enforces nothing — it *describes*. It answers "may I?", or it decides which
buttons to draw, or it reports whether you are still signed in. So the write path
stays correct and the product lies about it.

That difference matters for triage. `divergent-duplicate-guard` is a bypass and
usually HIGH. This one is usually MEDIUM, because the server still refuses — but
it is not cosmetic, and treating it as cosmetic is how it survives.

## What it looks like

The write path, correct, with the rule first because it is not a capability
question:

```ts
private async assertCanActionCorrection(user, request, action) {
  if (request.requestedByUserId === user.userId ||
      request.employee.userId === user.userId) {
    throw new ForbiddenException('You cannot approve or reject your own …');
  }
  if (this.canActionAttendanceCorrection(user, request, action)) return;
  // … assignment lookup
}
```

The read model, written to answer the same question for the UI, and identical
*except* for the rule that was added later:

```ts
private async canCurrentUserActionCorrection(user, request) {
  if (this.canActionAttendanceCorrection(user, request, 'approve') ||
      this.canActionAttendanceCorrection(user, request, 'reject')) return true;
  // … the same assignment lookup — and no party check at all
}
```

`canApprove` comes back `true`, the screen draws Approve, and pressing it returns
403.

The `@Public()` variant is the same shape with a different excuse. A route is
exempted from the guard for a real reason — a signed-out visitor should get an
answer, not a rejection — and reimplements *some* of what the guard does:

```ts
@Public() @Get('me')
me(@Req() req, @Res({ passthrough: true }) res) {
  return this.authService.getProfileFromRequest(req, res);   // signature, audience, expiry
}                                                            // …but never "is the session live?"
```

## Why it is dangerous here

Three instances landed in one session (SESSION-0084), in two modules:

- **BUG-2560** — the party check from BUG-0002 went into the write path and never
  into the read model behind the buttons. Production returned
  `canApprove true · canReject true` to the very person it then refused.
- **BUG-2547** — `/auth/me` verified signature, audience and expiry, never
  liveness. After sign-out, `GET /employees` refused the access token with
  `SESSION_REVOKED` while `/auth/me` answered `200` with the caller's identity for
  another 7.98 hours.
- **BUG-2506** — sign-out revoked by exact session id only when the refresh cookie
  was *absent*, and by a bounded hash scan otherwise. Same shape: two expressions
  of one decision, the weaker one carrying the common case.

The specific danger of the describing copy is that **it invites the wrong fix**.
A button that 403s reads as a broken endpoint, so the next person relaxes the
403. That would have removed a separation-of-duties control to make a UI bug go
away.

The second danger is that it is invisible from the code. All three read
correctly in isolation. Each is only wrong *relative to* another function, and
nothing in the type system or the tests compares them.

## How to detect it

- Grep for pairs: an `assertCanX` and a `canX`, a guard and a `@Public()` route
  that reads the same token, a write validator and a client-side validator.
  Read them side by side, not one at a time.
- Whenever you add a rule to a write path, search for every function whose name
  or return shape describes that write path — `can*`, `is*Allowed`, `*Status`,
  anything feeding a DTO field a frontend gates on — and treat each as stale
  until re-read.
- On any `@Public()` handler, enumerate what the guard does for the same token
  and check each item is done or deliberately skipped with a reason.
- From the outside: call the read endpoint and the write endpoint with the same
  credential and compare. That is how all three of these were actually found —
  by signing out and asking, not by reading.

## How to prevent it

**Assert both answers in one test.** Not the read model in its own test and the
write path in another — the same test, for the same subject:

```ts
await expect(readModel(service, user, correction)).resolves.toBe(false);
await expect(service.approveCorrectionRequest(user, id, {})).rejects
  .toBeInstanceOf(ForbiddenException);
```

Two separate green tests are exactly the state all three of these defects were
in. Pinning both answers together is the cheapest thing that would have caught
any of them, and it fails loudly the next time a rule is added to one side.

Add the negative control too — a manager who is *not* a party must still be
offered the action — or the fix can degenerate into "nobody may do anything",
which is a worse bug wearing a passing test.

## Records

REG ids are entries in one register file rather than notes of their own, so they
are named in plain text here; the bug records are notes and are linked.

- [[BUG-2560-the-requester-is-shown-approve-and-reject-buttons-that-alway]] /
  REG-378 — the buttons
- [[BUG-2547-a-revoked-session-still-answers-on-auth-me]] / REG-377 — `/auth/me`
- [[BUG-2506-sign-out-leaves-the-refresh-token-live-whenever-the-tenant-i]] /
  REG-375 — sign-out
- [[BUG-0002-self-approval-of-attendance-corrections]] / REG-002 — the rule all of
  this was supposed to enforce
- [[EXECPLAN-0029-attendance-correction-from-the-record-page]] — the task that
  found all three

## Related patterns

- [`divergent-duplicate-guard`](divergent-duplicate-guard.md) — two enforcing
  copies, rather than one enforcing and one describing
- [`read-filter-without-a-write-check`](read-filter-without-a-write-check.md) —
  the mirror image: the read side is the one doing the hiding
- [`self-approval`](self-approval.md) — the rule at the centre of two of these
- [`assertion-without-a-check`](assertion-without-a-check.md) — a test that
  confirms a defect rather than catching it
