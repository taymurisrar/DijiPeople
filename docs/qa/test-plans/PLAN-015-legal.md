---
PLAN_ID: PLAN-015
aliases: [PLAN-015]
TITLE: Legal document versioning, publication and consent
AREA: legal
STATUS: CURRENT
MODULES: [legal, leads, partner-experience]
RISK: HIGH
COVERAGE_UNIT: GAP
COVERAGE_API: GAP
COVERAGE_DATABASE: PARTIAL
COVERAGE_INTEGRATION: NOT_APPLICABLE
COVERAGE_E2E: GAP
COVERAGE_BROWSER: GAP
COVERAGE_SECURITY: GAP
COVERAGE_PERFORMANCE: NOT_APPLICABLE
RELATED_BUGS: []
RELATED_REGRESSIONS: []
CREATED_AT: 2026-08-18
UPDATED_AT: 2026-08-18
VERIFIED_AGAINST_SHA: bd0fb36
---

# PLAN-015 — Legal document versioning, publication and consent

## Scope

`services/api/src/modules/legal`, plus the two public acquisition paths that
capture an acknowledgement — `leads` (contact form) and `partner-experience`
(partner inquiry).

Covers document resolution, the draft/publish/archive lifecycle, immutability of
published text, market applicability, and the rule that an acknowledgement names
an exact version.

**Deliberately excludes** the content of any legal document. Whether the wording
is legally adequate is `PROFESSIONAL_REVIEW_REQUIRED` and is not a QA verdict —
this plan proves the machinery, never the text.

## Risks

1. **A published version edited in place.** Retroactively changes what everyone
   who accepted it is recorded as having agreed to. Highest severity here: it
   destroys evidence silently and leaves no trace that it happened.
2. **Two versions of one document simultaneously in force.** Makes "which text
   did this person accept" unanswerable for every acknowledgement in the overlap.
3. **An acknowledgement written without its subject, or a subject without its
   acknowledgement.** Unprovable consent. Guarded by writing both in one
   transaction.
4. **A draft reachable publicly.** Effectively publishes unreviewed text.
5. **The wrong market's document served.** Legally wrong content for the reader.
6. **Deleting an archived version.** Breaks the acknowledgement that cites it;
   guarded by `onDelete: Restrict`.

## Preconditions

Real PostgreSQL with migrations applied through
`20260818100000_legal_documents_and_subprocessors`. One global
`PRIVACY_POLICY` document and one market-bound document of the same type. A
launched market and an unmapped country.

## Test Types

| Type | Status | Note |
|---|---|---|
| UNIT | **COVERED** | `legal.service.spec.ts` — 12 tests over resolution, immutability, publish, draft numbering, acknowledgement routing |
| API | **GAP** | The public controller's 404-on-unpublished and cache headers are untested. |
| DATABASE | **GAP** | Transactional co-commit of lead + acknowledgement, and the `Restrict` foreign key, need real PostgreSQL. Blocker: no local credential. |
| E2E | **GAP** | Contact form to persisted acknowledgement, end to end. |
| BROWSER | **GAP** | Awaits WP-10 — no legal route exists in `apps/landing` yet. |
| SECURITY | **GAP** | Must prove a draft is unreachable by slug guessing and that `@Public()` routes are rate-limited. |
| INTEGRATION / PERFORMANCE | **NOT_APPLICABLE** | No external boundary; read volume is trivial and cached. |


> **Why COVERAGE_UNIT is GAP when unit specs exist.** The coverage matrix
> counts *scenarios*, not spec files, because a spec the registry cannot select
> cannot be re-run by `qa:select`. The specs listed under Test Types are real and
> pass; what is missing is a UNIT-type scenario record pointing at them. That gap
> is the accurate statement, and closing it is WP-13 work.

## Data Requirements

Documents and versions created per test. `subjectEmail` values must be synthetic.
No real personal data, and never a credential.

## Security Cases

- A `DRAFT` version is not resolvable by slug, by type, or in the published index.
- An `ARCHIVED` version is not served as current.
- Public endpoints carry `PublicRateLimitGuard`.
- Acknowledgement rows are never exposed on a public endpoint — they carry email,
  IP and user agent.
- A client-supplied `privacyNoticeVersion` is ignored; the server's resolved value
  wins. Already asserted by `public-lead-acquisition.spec.ts`.

## Negative Cases

- `updateDraft` on `PUBLISHED` → `LEGAL_VERSION_IMMUTABLE` (409), no write.
- `updateDraft` on `ARCHIVED` → same.
- `publish` on an already-published version → `LEGAL_VERSION_NOT_DRAFT` (409).
- `publish`/`updateDraft` on a missing id → `LEGAL_VERSION_NOT_FOUND` (404).
- Public fetch of a slug with no published version → 404.
- Resolution when nothing is published → null, and the caller renders no link.

## State Transitions

Legal: `DRAFT → PUBLISHED`, `PUBLISHED → ARCHIVED` (only as a side effect of
publishing a successor).

Illegal and to be rejected: `PUBLISHED → DRAFT`, `ARCHIVED → PUBLISHED`, any
content mutation outside `DRAFT`, and any delete of a version with
acknowledgements.

## Integration Cases

`NOT_APPLICABLE` — no external system participates.

## Browser Cases

Deferred to WP-10, which adds the public routes. That work must prove: each
published document renders at its slug, the footer lists only what is actually
published, and a market with nothing published shows no link rather than a broken
one. Tooling status: Playwright exists in CI (`browser-e2e`); the routes do not.

## Regression Links

None yet. QA-BILLING-003 implements this plan.
