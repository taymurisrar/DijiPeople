# Legal

> Generated from repository evidence at `1fb2bf9`, verified by the
> real-PostgreSQL run in `services/api/test/legal-documents.e2e-spec.ts`.

## Purpose

Versioned legal documents and the consent that points at them. It exists so that
an acknowledgement is **evidence** rather than a claim: the exact text a person
accepted stays retrievable years later.

## What it replaced

`CURRENT_PRIVACY_NOTICE_VERSION` — a date string in `leads/acquisition.catalog.ts`
that leads and partner inquiries were stamped with. It recorded *that* a version
was accepted while making it impossible to say what was actually read: the text
lived on no server, changing it needed a deploy, and the previous wording was
gone the moment it changed. The constant survives only as a pre-launch fallback
for the window before anything is published.

## Main API / services

`services/api/src/modules/legal/`:

- `LegalService.resolvePublished(type, marketId)` — the version in force.
- `resolvePublishedBySlug`, `listPublished` — public resolution and footer index.
- `createDraft` / `updateDraft` / `publish` — the authoring lifecycle.
- `acknowledge(input, tx?)` — takes an optional transaction client.
- `PublicLegalController` — `@Public()`, rate-limited, published versions or 404.

## Important business rules

- **A published version is immutable.** `updateDraft` refuses anything that is
  not `DRAFT` with `LEGAL_VERSION_IMMUTABLE`. Editing published text
  retroactively alters what everyone who accepted it is recorded as agreeing to.
  A correction is a new version.
- **Publishing archives its predecessor in one transaction.** Two versions of one
  document simultaneously in force makes "which text did this person accept"
  unanswerable for everything acknowledged in the overlap.
- **Archived versions are never deleted.** `onDelete: Restrict` from
  `LegalDocumentAcknowledgement` enforces it at the database.
- **Market-specific beats global.** `marketId` is nullable and null means "applies
  everywhere", so a jurisdiction gets its own wording without every other market
  needing a duplicate row. Version numbers are per document and are **never**
  comparable across documents.
- **Resolution returns null when nothing is published.** The caller's correct
  response is to render no link at all, not a page that claims terms exist.
- **An acknowledgement is written in the same transaction as its subject.** A lead
  that exists without the acknowledgement that justified contacting them is the
  split state that makes consent unprovable.

## Traps

**There is deliberately no draft-preview parameter.** A draft reachable by
guessing a URL is a published document with extra steps, and the whole
immutability guarantee rests on published text being the only text anyone outside
Admin can see.

**Acknowledgement rows carry email, IP and user agent.** They must never be
exposed on a public endpoint.

**`Market.legalDocumentSetRef` is a loose text reference kept for the market
catalogue.** `LegalDocument.marketId` is the real relation. Do not treat the text
field as authoritative.

## Consumers

`leads` (contact form, `landing:contact`) and `partner-experience` (partner
inquiry, `landing:partners`) both resolve the notice in force and write the
acknowledgement alongside the record. `/subscribe` is WP-05.

## Subprocessors

`Subprocessor` lives here because it is the same kind of claim — a factual public
disclosure. `processingRegion` is nullable and **null means unknown**, which is a
different and more honest statement than naming a plausible region on a page that
gets published.

## Not yet built

The public routes (`/privacy`, `/terms`, +8), the trust page and the
subprocessor page are WP-10 of [[TASK-0007]]. No document content is published
yet, and publishing content that names a legal entity waits on an owner decision
— the platform has no registered entity recorded anywhere.

Legal wording itself is `PROFESSIONAL_REVIEW_REQUIRED` and is never a QA verdict.
This module proves the machinery, never the text.

## Testing

`PLAN-015` and `QA-BILLING-003`. The referential guarantees — Restrict, the
single-version-in-force invariant, transactional co-commit — need real
PostgreSQL and live in `services/api/test/legal-documents.e2e-spec.ts`.

## Related

[[outbox]] · [[leads]] · [[TASK-0007]] · [[QA-BILLING-003]]
