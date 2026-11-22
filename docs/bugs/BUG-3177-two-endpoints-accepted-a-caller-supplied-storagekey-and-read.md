---
ID: BUG-3177
aliases: [BUG-3177]
Title: Two endpoints accepted a caller-supplied storageKey and read it back with no tenant-prefix check
Status: FIXED
Severity: HIGH
Priority: P1
Type: AUTHORIZATION
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/modules/recruitment, services/api/src/modules/app-releases]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-720
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
ResolvedAt: 2026-11-22
---

# BUG-3177 — Two endpoints accepted a caller-supplied storageKey and read it back with no tenant-prefix check

> **Architect triage, 2026-09-11 — `FIX_NOW`.** Accepting a caller-supplied storageKey and reading it back is a path-traversal-shaped hole into object storage. Resolve the key server-side from the record.

## Summary

Two endpoints accepted a caller-supplied storageKey and read it back with no tenant-prefix check

Identified by the 2026-09-10 full technical audit as FILE-03 (confidence: FILE-03=CONFIRMED).

## Expected Behavior

storageKey must never be client input. The register step should take the document id produced by /documents/upload and resolve the key server-side; openFile should take a required tenant prefix and refuse a key that does not start with it.

## Actual Behavior

storageKey is a bearer capability for the whole file store. Any caller who can register a candidate document (Recruiter-level recruitment.update) or publish an app release (appDownloads.manage) can name any key under FILE_STORAGE_DIR — including <other-tenant-id>/employees/<id>/documents/… — and stream the bytes back with no document-level, employee-level or tenant-level authorization applied. The path-traversal guard stops escape from the root but not from the tenant prefix. It also defeats FILE-08: an "archived" document's key still resolves.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**FILE-03** (services/api/src/modules/recruitment/*, services/api/src/modules/app-releases/app-release.controller.ts):

The DTO takes an arbitrary key from the request body:
```
services/api/src/modules/recruitment/dto/register-candidate-document.dto.ts:35-38
  @IsOptional()
  @IsString()
  @MaxLength(512)
  storageKey?: string;
```
and it is persisted verbatim:
```
services/api/src/modules/recruitment/recruitment.service.ts:763
  const storageKey = dto.storageKey?.trim();
...:790-799
  const document = await this.recruitmentRepository.createDocumentReference({
    tenantId: currentUser.tenantId, ..., storageKey, ...
```
and read back with no validation that the key belongs to this tenant:
```
services/api/src/modules/recruitment/recruitment.service.ts:1009-1012
    return { document,
      file: await this.storageService.openFile(document.storageKey),
      redirectUrl: null };
```

The same shape exists on the release catalogue, which is not tenant-scoped at all:
```
services/api/src/modules/app-releases/app-release.controller.ts:76
  @IsOptional() @IsString() @MaxLength(500) storageKey?: string;
services/api/src/modules/app-releases/app-release.service.ts:221-222
  if (release.storageKey) {
    const file = await this.storage.openFile(release.storageKey);
```
POST /app-releases requires appDownloads.manage, which a tenant System Admin holds (BASE_ROLE_PERMISSION_KEYS['system-admin'] = NON_CUSTOMIZATION_PERMISSION_KEYS, permissions.ts:2187).

The traversal guard is real but only contains the key to the storage root — it does not scope it to a tenant:
```
services/api/src/common/storage/storage.service.ts:87-93
  private resolveStoragePath(storageKey: string) {
    const normalizedKey = normalize(storageKey).replace(/^(\.\.(\/|\\|$))+/, '');
    return join(this.getStorageRoot(), normalizedKey);
  }
```

Keys are exposed to the client in every document response:
```
services/api/src/modules/documents/documents.service.ts:966-978
  private mapDocument(document: DocumentWithRelations) {
    return { id: ..., tenantId: document.tenantId, ...,
             storageKey: document.storageKey, ...
```
and written into audit snapshots (documents.service.ts:433-441, beforeSnapshot: this.mapDocument(document)), and the frontend round-trips one back to the API by design (apps/web/app/(authenticated)/recruitment/_components/cv-upload-parse-flow.tsx:536 storageKey: uploadResult.storageKey).

---


Full finding text: FILE-03 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/FILE.md`.

## Root Cause

Two endpoints accepted a caller-supplied storageKey and read it back with no tenant-prefix check.

## Impact

Full authorization bypass on stored files within a tenant (a recruiter reads HR-only contracts), and cross-tenant read of any file whose key has leaked. Keys are random UUIDs so they cannot be guessed, but they are returned to browsers, stored in audit rows, and echoed through the recruitment flow — they are not treated as secrets anywhere.

## Affected Areas

services/api/src/modules/recruitment, services/api/src/modules/app-releases

## Proposed Resolution

Remove storageKey from RegisterCandidateDocumentDto and from the app-release publish DTO; have registerCandidateDocument accept documentId and read Document.storageKey under a tenantId filter. Add a tenantPrefix parameter to StorageService.openFile and assert normalizedKey.startsWith(prefix + '/'). Strip storageKey from mapDocument and from audit snapshots.

(Difficulty: MEDIUM (the frontend CV flow changes with it); Regression risk: MEDIUM; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/src/modules/recruitment/*, services/api/src/modules/app-releases/app-release.controller.ts (audit id FILE-03).

## Regression Coverage

services/api/src/common/storage/storage.service.spec.ts. REG-720, QA-PLATFORM-068. The existing spec asserts a foreign tenant object is refused; no DB-backed HTTP test registers a candidate document with a foreign id yet.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `FILE-03` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/FILE.md`

## Resolution

STALE: Already fixed before this session. Verified by an independent read of the current code (develop 23335bdc, 2026-11-22); closed with its existing regression test rather than a new one. The DTOs no longer take storageKey (a client that sends it gets 400), and openFile requires a scope and rejects keys outside it.

Fixed on branch agent/dependency-alert-remediation (SESSION-0137). Premise re-verified against the code before changing it (2026-11-22).

## QA Retest

QA-PLATFORM-068 on the isolated database, 2026-11-22: passing with the fix and failing with it removed. Independent review pending.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (FILE-03) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-720 (see the regression register)

<!-- GRAPH:END -->
