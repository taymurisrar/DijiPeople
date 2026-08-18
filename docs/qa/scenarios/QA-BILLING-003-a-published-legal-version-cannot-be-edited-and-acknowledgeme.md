---
SCENARIO_ID: QA-BILLING-003
aliases: [QA-BILLING-003]
TITLE: A published legal version cannot be edited and acknowledgements keep pointing at it
AREA: legal
MODULE: legal
TYPE: DATABASE
RISK: HIGH
AUTOMATION_STATUS: PARTIAL
TEST_REFERENCE: services/api/src/modules/legal/legal.service.spec.ts
RELATED_BUGS: []
RELATED_REGRESSIONS: []
LAST_RUN: 2026-08-18
LAST_RESULT: PASS_WITH_RISKS
CREATED_AT: 2026-08-18
UPDATED_AT: 2026-08-18
---

# QA-BILLING-003 — A published legal version cannot be edited and acknowledgements keep pointing at it

## Preconditions

A real PostgreSQL database with the migration history applied through
`20260818100000_legal_documents_and_subprocessors`.

One `LegalDocument` of type `PRIVACY_POLICY` with no market (global), and a
second of the same type bound to a launched market.

## Steps

1. Create a draft version, publish it, and submit a public contact form.
2. Attempt `updateDraft` on the now-published version.
3. Create and publish a second version of the same document.
4. Re-read the acknowledgement written in step 1.
5. Request the public document endpoint for the global slug.
6. Request the public endpoint for a document with no published version.
7. Resolve the notice for the launched market, then for an unmapped market.
8. Attempt to delete the archived version from step 1 while its acknowledgement
   exists.

## Expected Result

1. The lead row and one `LegalDocumentAcknowledgement` exist, written in the same
   transaction, with `legalDocumentVersionId` naming the published version and
   `Lead.privacyNoticeVersion` reading `v1`.
2. Rejected with `LEGAL_VERSION_IMMUTABLE` (409). **No** write reaches the
   database. Editing published text would retroactively change what everyone who
   accepted it is recorded as having agreed to.
3. Version 1 becomes `ARCHIVED` with `effectiveTo` set to version 2's
   `effectiveFrom`; version 2 is `PUBLISHED` with `effectiveTo = null`. At no
   instant do two versions of one document have `effectiveTo = null` — a
   simultaneous overlap makes "which text did they accept" unanswerable.
4. The step 1 acknowledgement still points at **version 1**, not version 2, and
   version 1's text is still readable in full.
5. Returns the currently published version only.
6. Returns 404. There is no draft-preview parameter — a draft reachable by
   guessing a URL is a published document with extra steps.
7. The market-specific document wins for the launched market; the unmapped market
   falls back to the global document. Version numbers are per document and are
   never compared across documents.
8. Refused by the `onDelete: Restrict` foreign key. Evidence cannot be deleted out
   from under an acknowledgement that cites it.

## Notes

Created 2026-08-18 at `bd0fb36`.

**`LAST_RESULT: PASS_WITH_RISKS` is deliberate.** Steps 2, 3, 5, 6 and 7 are covered by
`legal.service.spec.ts` against Prisma doubles and pass. Steps 1, 4 and 8 depend
on real database behaviour — transactional co-commit of lead and acknowledgement,
and the `Restrict` foreign key — which a double cannot demonstrate. They need real
PostgreSQL; no local credential was available when this was written.

WP-13 owns promoting this to a real-PostgreSQL run.
