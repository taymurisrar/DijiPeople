---
ID: ITEM-0053
aliases: [ITEM-0053]
Title: Publish privacy policy and terms for the public landing site
Type: PRODUCT_DECISION
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [apps/landing]
Source: QA_RUN
OwnerAgent: release-devops
ArchitectDisposition: DONE
CreatedAt: 2026-08-18
UpdatedAt: 2026-08-24
RelatedBug: 
RelatedQA: docs/qa/runs/2026-08-17-landing-uiux-browser-qa-f58ee1d.md
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0053 — Publish privacy policy and terms for the public landing site

## Summary

The landing site collects names, work emails, phone numbers, company details and
a marketing-consent flag through four public forms, and exposes no privacy
policy or terms of service anywhere. No such route exists in `apps/landing`, and
no legal copy exists in the repository to link to.

## Why It Matters

This is the one finding in the landing remediation package that engineering
cannot close on its own. Every other footer and form issue was a code fix; this
one needs legal text that a person with authority has to write and approve.

The exposure is concrete rather than theoretical: `contact-form.tsx` records
`privacyNoticeVersion` and `privacyNoticeAcceptedAt` against every lead, and the
`Lead` model persists both. The product is already recording consent **against a
notice that is not published anywhere**, which is weaker than not recording it.

## Evidence

- No `/privacy` or `/terms` route exists — the landing route tree is 14 routes,
  none of them legal.
- `services/api/prisma/schema.prisma` — `Lead.privacyNoticeVersion`,
  `Lead.privacyNoticeAcceptedAt`, `Lead.marketingConsent`,
  `Lead.marketingConsentAt` are all populated by public form submissions.
- Raised as sub-finding 6 of
  [[ITEM-0051-align-landing-public-form-conventions-and-minor-accessibilit]];
  split out here because it is a product/legal decision, not UX debt.

## Proposed Approach

**Not an engineering task until the copy exists.** Legal text must not be
drafted by an agent, and a placeholder page is worse than no page — it is a
published statement about how personal data is handled.

The interim UX chosen during the remediation is to link only to destinations
that exist: the footer now carries product navigation plus real `mailto:` and
`tel:` contact routes, and no link promises a policy that is not there.

Once approved copy exists: add `/privacy` and `/terms` under `PageShell`, link
them from the footer, and set `privacyNoticeVersion` to the published version so
the consent already being recorded refers to something real.

## Acceptance Criteria

1. Approved privacy policy and terms copy exists, owned by a named person.
2. `/privacy` and `/terms` render through the standard shell.
3. Both are linked from the site footer.
4. `privacyNoticeVersion` written on new leads matches the published version.

## Dependencies

Blocked on a product/legal decision, not on engineering.

## Related Items

[[ITEM-0051-align-landing-public-form-conventions-and-minor-accessibilit]]

## Correction — 2026-08-22, SESSION-0040

**This record’s premise is out of date and the engineering is finished.** It says
"no legal copy exists in the repository" and "no such route exists in
`apps/landing`". Both were true when it was written. Neither is true now — the
`legal` module was built afterwards.

What exists today:

- **Ten drafted documents** in `services/api/prisma/seed-legal.ts`: privacy,
  terms, billing-terms, refund-policy, cookie-policy, acceptable-use, security,
  subprocessors, data-retention, dpa.
- **A versioned publication model** — `LegalDocumentVersion` with DRAFT and
  PUBLISHED states, and `LegalService.publish`.
- **Public API routes** — `GET /api/public/legal` and `/api/public/legal/:slug`.
- **Live landing routes** — `/legal/[slug]` is deployed and rendering.
- **The release script already does it**: `npm run release` runs
  `seed:legal && legal:publish -- --confirm`.

### The only thing missing is a deployment

Production, read 2026-08-22:

```
GET https://api.dijipeople.com/api/public/legal   ->  {"documents":[]}
GET https://www.dijipeople.com/legal/privacy      ->  200, "Not published yet"
```

The page says, in its own words: *"The privacy policy is drafted but has not been
published. We do not put legal text on this page before it has been reviewed,
and we do not fill the gap with a placeholder — a document you cannot rely on is
worse than one that is honestly absent."*

That is this record’s own reasoning, already implemented, already deployed, and
waiting on exactly the thing the user has now supplied: **legal review**.

Production is on `3602ec3`, which predates the legal module. The documents are
not unpublished because publication failed; they are unpublished because the
release that would publish them has not run.

### What remains

1. **A production release.** `npm run release` seeds and publishes as part of the
   normal pipeline. This is a `RELEASE` task targeting `main` and needs the
   user’s go-ahead — the standing instruction has been "no release yet".
2. **`/legal` returns 404.** The per-document routes work; there is no index
   page listing them. Small, and worth fixing in the same release.
3. **Wire `privacyPolicyHref`.** `contact-form.tsx` still defaults it to `null`
   with the comment "Null when no privacy route exists yet". The route exists
   now, so the consent notice can link to it — which is what closes the original
   exposure: consent is currently recorded against a notice with no address.

## History

- 2026-08-24 — **closed.** All four acceptance criteria are met, verified against
  production at `6ed7a44`:

  1. *Approved copy exists, owned by a named person* — the owner supplied real
     legal text; `2852855e` replaced the placeholder drafts, and [[BUG-0899]]
     records why that had to happen before any deploy could succeed.
  2. *Renders through the standard shell* — `GET /legal/privacy` returns `200`;
     an unknown slug returns `404` rather than a streamed empty shell
     ([[BUG-0907]]).
  3. *Linked from the site footer* — the landing footer links all **ten**
     published documents, privacy and terms included.
  4. *`privacyNoticeVersion` matches the published version* — met by
     construction: `leads.service.ts:147` derives it from the published notice
     rather than from the request, and `public-lead-acquisition.spec.ts`
     asserts an attacker-supplied value is ignored. Suite green, 27 tests.

  `GET /api/public/legal` returns ten documents at version 1, published
  2026-08-23T21:23Z.

  This record was already annotated on 2026-08-22 ("the engineering is
  finished") and left `READY` anyway. The annotation was correct; only the
  status field lagged.
- 2026-08-17 — split out of ITEM-0051 during the landing remediation, because
  inventing legal copy was explicitly out of scope and a placeholder would have
  been a false statement rather than a missing one.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[BUG-0767]]
- Modules — [[landing-architecture]]
- QA run — [[2026-08-17-landing-uiux-browser-qa-f58ee1d]]

<!-- GRAPH:END -->

- 2026-08-22 — user confirmed the copy is legally reviewed. Premise corrected: the module, the documents, the routes and the publish step all exist and are deployed. What blocks publication is a production release, not legal text.
