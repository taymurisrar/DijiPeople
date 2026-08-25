---
ID: BUG-1303
aliases: [BUG-1303]
Title: The DP-CHK-01 checkout-unavailable link writes a diagnostic code into the partner referral cookie
Status: OPEN
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-25
DetectedInSha: 42435d59
AffectedModules: [apps/landing]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-25-landing-e2e-local-and-prod-42435d5.md
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-25
UpdatedAt: 2026-08-25
ResolvedAt:
---

# BUG-1303 — The DP-CHK-01 checkout-unavailable link writes a diagnostic code into the partner referral cookie

## Summary

When a plan cannot be bought online, `/subscribe` offers "Ask us to arrange this
plan", which links to `/contact?ref=DP-CHK-01`. But `?ref=` is the **partner
referral attribution** channel. Following that link stores the string
`DP-CHK-01` as the visitor's referral code in a 30-day first-party cookie and in
`sessionStorage`. Because attribution is deliberately first-touch, that visitor
is then immune to every genuine partner link for the next thirty days: a real
partner's code arrives, finds the slot already taken, and is discarded.

The product's own error path therefore burns the attribution slot that partner
commissions are calculated from.

## Expected Behavior

`?ref=` carries partner referral codes and nothing else. A diagnostic code that
tells the support team which plan and region a visitor was looking at should
travel in its own parameter — it is a different fact, with a different owner and
a different lifetime — and must never displace or pre-empt a partner code.

## Actual Behavior

`DP-CHK-01` is accepted as a referral code (it matches the permitted pattern
`/^[A-Za-z0-9_-]{1,64}$/`), persisted for thirty days, and — under the
first-touch rule — beats any partner code the visitor encounters afterwards.

## Reproduction

Verified live against `https://www.dijipeople.com` on 2026-08-25.

1. Open `/subscribe?plan=starter&billingInterval=YEAR&teamSize=25` from a market
   with no purchasable price (any QAR visitor today). The `DP-CHK-01` block
   renders.
2. Click **Ask us to arrange this plan**. It navigates to
   `/contact?ref=DP-CHK-01`.
3. Read the stored referral:

   ```js
   ({ session: sessionStorage.getItem('dijipeople_referral'), cookie: document.cookie })
   ```

   Returns:

   ```json
   { "session": "DP-CHK-01", "cookie": "dijipeople_referral=DP-CHK-01" }
   ```

4. Now arrive under a genuine partner link — navigate to
   `https://www.dijipeople.com/?ref=REALPARTNER99`.
5. Read the stored referral again. It is **still** `DP-CHK-01`; the partner code
   was dropped.

## Evidence

Step 3 and step 5 outputs above are the verbatim values read from production.
Step 5 is the finding: after the diagnostic code is stored, a real partner code
does not take effect.

The link itself, rendered by the checkout-blocked panel in
[`apps/landing/app/subscribe/subscribe-form.tsx`](../../apps/landing/app/subscribe/subscribe-form.tsx):

```
link "Ask us to arrange this plan" -> /contact?ref=DP-CHK-01
```

The capture rule and the first-touch decision it collides with are documented in
[`apps/landing/lib/referral.ts`](../../apps/landing/lib/referral.ts):

- `const CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;` — `DP-CHK-01` passes.
- `const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;` — thirty days.
- "First touch wins: a visitor who arrives under one partner's link and later
  clicks another's stays with the first" — which is correct policy, and is
  exactly what makes this collision harmful rather than cosmetic.

That file also records why capture was moved out of the lead form and made
global (BUG-0281): so a code survives from any entry page through to whichever
form is eventually submitted. That change is what gives `DP-CHK-01` its reach.

## Root Cause

Two unrelated concerns were routed through one query parameter. `?ref=` was
already the partner attribution channel when the checkout-unavailable panel was
given a "quote this code to support" affordance, and the panel reused `ref`
rather than introducing a parameter of its own. The referral capture layer
cannot tell the two apart, because a diagnostic code and a partner code are
syntactically identical.

## Impact

Reachable in production right now, and — because **no** QAR plan is currently
purchasable (see [[BUG-0898]]) — every Qatar visitor who clicks the offered
"Ask us to arrange this plan" button is affected. Today that is the *normal*
path through `/subscribe`, not an edge case.

Consequences, in order of seriousness:

1. **Partner commissions are silently lost.** A visitor who hits an unavailable
   plan, then later arrives through a genuine partner link and buys, is recorded
   as a `DP-CHK-01` referral. The partner sees no referral; nobody sees an
   error. This is the same failure shape as BUG-0281, arriving from the
   opposite direction.
2. **Attribution data is polluted.** Leads and customers carry a referral code
   that names an error condition, so referral reporting counts a diagnostic as
   an acquisition channel.

`referral.ts` notes that "a forged code attributes nothing because a code is not
a partner id", which is true and limits the damage to *lost* attribution rather
than *misdirected* commission. It does not prevent the loss.

## Affected Areas

- `apps/landing/app/subscribe/subscribe-form.tsx` — the link that emits it.
- `apps/landing/lib/referral.ts` — capture, storage and first-touch precedence.
- `PartnerReferralResolverService` and anything reading `referralCode` on leads,
  customers and subscription orders.

## Proposed Resolution

Stop sending the diagnostic code through `?ref=`. Give it a parameter of its
own — for example `/contact?checkout=DP-CHK-01` — read by the contact form for
context and never written to the referral store.

Defence in depth, worth doing alongside: have `referral.ts` reject codes that
match the platform's own diagnostic-code shape (`DP-XXX-nn`) rather than storing
anything that satisfies the character-class pattern. That way a future feature
reusing `ref` by accident cannot repeat this.

No ExecPlan required; no schema or migration is involved.

## Acceptance Criteria

- Clicking "Ask us to arrange this plan" leaves `dijipeople_referral` unset for
  a visitor who has no referral code.
- A visitor who clicks it and *then* arrives under `?ref=<partner code>` has the
  partner code stored.
- A visitor who arrives under a genuine partner code first and then clicks it
  keeps the partner code (first-touch still holds).
- The contact form still receives enough context to identify the plan and region
  the visitor was blocked on.

## Regression Coverage

Needs a test that fails today: capture with `?ref=DP-CHK-01`, then capture with
`?ref=PARTNER1`, and assert the stored value is `PARTNER1`. `referral.ts` is
plain browser logic, so this belongs in the landing unit tests rather than an
end-to-end run.

## Dependencies

None.

## Related Items

- [[BUG-0281]] — the original referral-capture defect this shares a mechanism with.
- [[BUG-0898]] — why the DP-CHK-01 path is currently the common path.

## Resolution

Not yet fixed.

## QA Retest

Pending. Retest with the five-step reproduction above, on production and on a
local stack.

## History

- 2026-08-25 — created from qa run at `42435d59`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[landing-architecture]]

<!-- GRAPH:END -->
