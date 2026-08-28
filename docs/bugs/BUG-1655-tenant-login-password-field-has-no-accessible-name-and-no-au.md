---
ID: BUG-1655
aliases: [BUG-1655]
Title: Tenant login password field has no accessible name and no autocomplete hint
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-27
DetectedInSha: 21032ae
AffectedModules: [auth]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-289
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-27
UpdatedAt: 2026-08-28
ResolvedAt:
---

# BUG-1655 — Tenant login password field has no accessible name and no autocomplete hint

> **Architect triage, 2026-08-27 — `DEFER`.** Real and worth doing, but one field on one form. Sequence it behind the [[BUG-1423]] accessibility plan so the label convention is fixed once across both apps rather than patched here.


## Summary

On the tenant login screen the password input has no accessible name and no
`autocomplete` attribute. The email field beside it has both. A screen reader
announces the password field as unlabelled, and password managers are not told
what it is.

## Expected Behavior

Every credential field carries an accessible name and the appropriate
`autocomplete` token — `username` and `current-password` on a sign-in form.

## Actual Behavior

The email input exposes the name "Work email". The password input exposes no
name at all; the visible "Password" text is not associated with it. Chrome logs
the missing autocomplete explicitly.

## Reproduction

1. Open `https://<slug>.ws.dijipeople.com/login?tenant=<slug>`.
2. Take an accessibility snapshot of the form.
3. Read the browser console.

## Evidence

Observed on production 2026-08-27, tenant `dijipeople-demo`.

Accessibility snapshot — the email field is named, the password field is not:

```
textbox "Work email" [ref=…]
textbox [ref=…]            <- placeholder "Enter your password", no name
```

Console, on load:

```
[VERBOSE] [DOM] Input elements should have autocomplete attributes
          (suggested: "current-password")
```

## Root Cause

Not established. The visible "Password" text sits in a wrapper alongside a
"Forgot password?" button rather than in a `<label>` bound to the input, which
would produce exactly this, but the component has not been read.

The asymmetry is the useful signal: the email field in the same form is correct,
so this is not a missing convention, it is one field that diverged from it.

## Impact

Someone using a screen reader reaches an unlabelled field on the sign-in form
and must infer from position what it wants. That is the front door of the tenant
product, and it is a lower bar to clear than any screen behind it.

Password managers are also less able to fill the form, which is a small friction
for everyone rather than a barrier for a few.

Narrower than [[BUG-1423]], which found the same class across every runtime form
control in `apps/admin`. This is one field on one screen — but it is the screen
every user of every tenant passes through.

## Affected Areas

- The tenant login form in `apps/web`
- `apps/admin` login has not been checked for the same divergence

## Proposed Resolution

Bind the visible label to the input, and add `autocomplete="current-password"`
to the password field and `autocomplete="username"` to the email field.

Then check the admin login for the same divergence, since the two forms were
probably written from the same starting point.

## Acceptance Criteria

- The password input exposes an accessible name.
- `autocomplete` is set on both credential fields and Chrome stops warning.
- An accessibility snapshot of the login form shows every control named.

## Regression Coverage

None yet. Would fall out of a broader assertion that every control in the login
forms has an accessible name. Requires a `REG-nnn` entry once written.

## Dependencies

None.

## Related Items

Same class as [[BUG-1423]] and its duplicate [[BUG-1552]], which cover the
runtime form controls in `apps/admin`. Found on the same sign-in as
[[BUG-1649]] and [[BUG-1654]].

## Resolution

Fixed 2026-08-28 on `agent/open-bug-sweep`.

The tenant login's password field takes `ariaLabel="Password"` and
`autoComplete="current-password"`, and the email field's token changes from
`email` to `username` — both are valid, and only `username` pairs with
`current-password` as a credential set, which is what makes a password manager
offer to fill the two together.

The name has to be passed explicitly because of a layout decision: the visible
"Password" text sits in the heading row beside the "Forgot password?" link, and
the shared control's own label span is suppressed with `[&>span]:hidden` so the
two line up. That left the input with no name at all. `TextField` now accepts
`ariaLabel` and `autoComplete` and applies both, so any field in this app with a
hidden label can say what it is.

This record also asked that the admin login be checked for the same divergence,
on the reasoning that the two forms were probably written from one starting
point. **They were not.** The admin form already binds both labels with
`htmlFor` and already declares `current-password`. That is asserted rather than
noted, because "we checked and it was fine" is worth exactly as much as whatever
keeps it fine.

Guarded by REG-289.

## QA Retest

Not retested with a screen reader or a password manager.

`apps/web/app/components/ui/login-field-accessibility.spec.ts` covers both
fields, the shared control's passthrough, and the admin form's existing
correctness.

The behavioural check is a password manager: it should offer to fill both fields
at once, which it could not do before because the pair was not identifiable as a
credential set.

## History

- 2026-08-27 — found on the first browser sign-in to a tenant workspace.
- 2026-08-28 - un-deferred: the password field has a name and an autocomplete token; the admin login was already correct. REG-289.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[auth]]
- Regression — REG-289 (see the regression register)

<!-- GRAPH:END -->
