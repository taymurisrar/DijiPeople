---
ID: BUG-3185
aliases: [BUG-3185]
Title: Reading or downloading a document is recorded nowhere
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/modules/documents]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-712
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-11-24
ResolvedAt: 2026-11-22
---

# BUG-3185 — Reading or downloading a document is recorded nowhere

> **Architect triage, 2026-09-11 — `FIX_NOW`.** Document reads unrecorded. For an HR product holding contracts and payslips, who opened what is the audit trail.

## Summary

Reading or downloading a document is recorded nowhere

Identified by the 2026-09-10 full technical audit as OBS-16 (confidence: OBS-16=CONFIRMED).

## Expected Behavior

A read of a stored personal document is an audited action. The product already knows how — `modules/agent/dlp/dlp.service.ts:361-380` audits every read of captured clipboard content, and `dlp.controller.ts:42-45` explains why: *"Reading content is a different authority from configuring the agent, and every read is audited in the service."* The same reasoning applies to HR documents and was not applied.

## Actual Behavior

Nobody can answer "who read this employee's medical certificate, salary letter, or scanned CNIC".

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**OBS-16** (services/api/src/modules/documents/documents.service.ts):

`services/api/src/modules/documents/documents.service.ts:446-462`:
```ts
async openForView(currentUser: AuthenticatedUser, documentId: string) {
  const document = await this.documentsRepository.findById(currentUser.tenantId, documentId);
  if (!document || document.isArchived || !document.storageKey) { throw new NotFoundException(...); }
  await this.assertDocumentReadAccess(currentUser, document);
  return { document, file: await this.storageService.openFile(document.storageKey) };
}
```
and `:464-474` — `openForDownload` performs a settings check then `return this.openForView(currentUser, documentId);`. Neither touches `AuditService`.
Both are reachable: `modules/documents/documents.controller.ts:158` `@Get(':documentId/view')`, `:181` `@Get(':documentId/download')`.
Only writes are logged: `documents.service.ts:324 'DOCUMENT_UPLOADED'`, `:400 'DOCUMENT_UPDATED'`, `:436 'DOCUMENT_ARCHIVED'`.
`rg "DOCUMENT_DOWNLOADED|DOCUMENT_VIEWED|DOCUMENT_ACCESSED" services/api/src/modules` returns exactly one hit — `modules/contracts/contracts.service.ts:4410` — and that writes a contract-scoped *timeline* row, not an `AuditLog` row (OBS-17).

---


Full finding text: OBS-16 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md`.

## Root Cause

openForView and openForDownload audited nothing.

## Impact

A GDPR/labour-law subject access request asking "who accessed my file" cannot be answered. Insider exfiltration of employee identity documents leaves no trace at all.

## Affected Areas

services/api/src/modules/documents

## Proposed Resolution

Add `AuditService.log({ action: 'DOCUMENT_VIEWED' | 'DOCUMENT_DOWNLOADED', entityType: 'Document', entityId, … })` in `openForView`/`openForDownload`, distinguishing the two so a bulk download is visible. Mirror it in `modules/payslips` download and `modules/employees` export.

(Difficulty: LOW; Regression risk: LOW (audit volume — index already exists on (tenantId, action, createdAt)); Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/src/modules/documents/documents.service.ts (audit id OBS-16).

## Regression Coverage

services/api/test/audit-trail-reads.e2e-spec.ts. REG-712, QA-AUDIT-002. Disabling the audit fails 2 tests.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `OBS-16` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md`

## Resolution

After access is granted and the bytes opened, DOCUMENT_VIEWED or DOCUMENT_DOWNLOADED is recorded with the document id and no content. The published branding asset bypass is excluded so page renders do not write rows. An audit failure is logged and never blocks the read. Other read paths (employee documents, recruitment, support cases) are not yet covered and stay on the record.

Fixed on branch agent/dependency-alert-remediation (SESSION-0137). Premise re-verified against the code before changing it (2026-11-22).

## QA Retest

QA-AUDIT-002 on the isolated database, 2026-11-22: passing with the fix and failing with it removed. Independent review pending.

Independent QA retest 2026-11-24 (SESSION-0137 reconciliation): documents.service.ts logs DOCUMENT_VIEWED/DOWNLOADED; e2e asserts exactly one row per view/download with actor, no content, and no row on refused cross-tenant read; pass.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (OBS-16) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-712 (see the regression register)

<!-- GRAPH:END -->
- 2026-11-24 — FIXED → VERIFIED by independent QA (SESSION-0137 reconciliation).
