---
ID: BUG-0906
aliases: [BUG-0906]
Title: Production has no published legal documents, so purchases record no consent and the footer links to nothing
Status: PRODUCT_DECISION
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-23
DetectedInSha: 1dd74a25
AffectedModules: [services/api/src/modules/legal, apps/landing]
OwnerAgent: architect
ArchitectDisposition: PRODUCT_DECISION
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-23
UpdatedAt: 2026-08-23
ResolvedAt:
---

# BUG-0906 — Production has no published legal documents, so purchases record no consent and the footer links to nothing

## Summary

`GET https://api.dijipeople.com/api/public/legal` returns `{"documents":[]}`.
Ten legal routes exist and all ten render their "not published yet" state. The
consequences run further than the pages themselves: the subscribe wizard's
Agreements step has nothing to offer, so it passes straight through, and the
order is created with no `LegalDocumentAcknowledgement` at all. The site sells a
subscription without recording what the buyer agreed to.

## Expected Behavior

At minimum the Terms of Service, Privacy Policy and Subscription and Billing
Terms are published before the platform takes money, the footer links to them,
and each purchase records the exact version ids the buyer accepted.

## Actual Behavior

- `/public/legal` → `{"documents":[]}`
- Footer renders no legal column.
- `sitemap.ts` lists no legal URLs.
- The Agreements step offers zero checkboxes and is skipped.
- `acceptedLegalVersionIds` is absent from the checkout payload, and the API
  accepts that — the field is `@IsOptional()` on `PublicSubscribeDto`.

## Reproduction

1. `curl https://api.dijipeople.com/api/public/legal` → `{"documents":[]}`.
2. Open `https://www.dijipeople.com/legal/terms` — renders the unpublished
   state.
3. Drive the subscribe wizard to the Agreements step; it advances without
   presenting anything to accept. (Reproduced on the isolated stack, where the
   legal state matches production exactly.)

## Evidence

Production API:

```
GET /api/public/legal        -> 200 {"documents":[]}
GET /api/public/legal/index  -> 404 DATABASE_RECORD_NOT_FOUND
```

Checkout payload sent by the wizard on a completed purchase — note the absent
`acceptedLegalVersionIds`:

```json
{"planPriceId":"8b09be0d-…","seatQuantity":25,"companyName":"QA Test Co …",
 "contactName":"Ada Lovelace","email":"qa+…@dijipeople.local","country":"Pakistan",
 "requestedSlug":"qa-…","estimatedEmployeeCount":25,
 "ownerFirstName":"Ada","ownerLastName":"Lovelace"}
```

The wizard's own gate, `subscribe-form.tsx:140` — with nothing published, the
required set is empty and the step is vacuous:

```ts
const acceptableAgreements = agreements.filter((entry) => entry.versionId);
```

## Root Cause

Publication has never succeeded, because the only automated path to it is the
release chain that always fails — [[BUG-0899]]. Underneath that, the documents
are placeholder drafts that correctly refuse to be published.

The API's permissiveness is a separate, deliberate choice: `acceptedLegalVersionIds`
is optional so the sales-assisted path can create orders without it. That is
reasonable for sales-assisted and wrong for self-service, where nothing else
captures consent.

## Impact

Commercial and compliance rather than functional: purchases complete, but the
platform cannot answer "what did this customer agree to, and when". For a
multi-tenant SaaS taking card payments that is a material gap at go-live. Also
degrades the public site — no terms, privacy or refund policy for visitors or
crawlers.

## Affected Areas

- `services/api/src/modules/legal` and `public-legal.controller.ts`
- `services/api/prisma/seed-legal.ts`, `publish-legal.ts`
- `apps/landing/lib/legal-server.ts`, `app/legal/[slug]/page.tsx`,
  `app/_components/site-shell.tsx` (footer), `app/sitemap.ts`
- `apps/landing/app/subscribe/onboarding-steps.tsx` (Agreements step)

## Proposed Resolution

1. Replace the placeholder text with reviewed copy and publish — the same
   product/legal decision that unblocks [[BUG-0899]].
2. Once documents exist, consider requiring at least the billing-terms
   acknowledgement on the **public** checkout path specifically, leaving the
   sales-assisted path permissive. Requires an ExecPlan, because it changes what
   the API will refuse.

## Acceptance Criteria

- `/public/legal` returns the published set for a launched market.
- The footer and sitemap list them.
- A completed self-service purchase writes `LegalDocumentAcknowledgement` rows
  naming the exact versions shown.

## Regression Coverage

None yet. A deployment smoke assertion that a launched market has published
terms would catch the recurrence.

## Dependencies

Blocked by [[BUG-0899]] — nothing can be published until the release chain can
complete.

## Related Items

[[BUG-0899]], [[BUG-0898]]

## Resolution

Not fixed here. The legal copy is the owner's to supply and review.

## QA Retest

Retest by fetching `/public/legal`, checking the footer and sitemap, then
completing a purchase and confirming acknowledgement rows exist.

## History

- 2026-08-23 — created from qa run at `1dd74a25`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0090]]
- Modules — [[legal]], [[landing-architecture]]

<!-- GRAPH:END -->
