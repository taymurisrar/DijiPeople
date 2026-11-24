---
ID: BUG-3179
aliases: [BUG-3179]
Title: Nine/ten upload endpoints had no multipart size limit; the check ran after the whole file was already in the heap
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: SECURITY
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/common]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-716
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-11-24
ResolvedAt: 2026-11-22
---

# BUG-3179 — Nine upload endpoints had no multipart size limit; the check ran after the whole file was already in the heap

> **Architect triage, 2026-09-11 — `FIX_NOW`.** A size limit checked after the body is buffered is not a limit. Nine of ten upload endpoints; the fix is one place.

## Summary

Nine upload endpoints had no multipart size limit; the check ran after the whole file was already in the heap

Identified by the 2026-09-10 full technical audit as FILE-05 (confidence: FILE-05=CONFIRMED), and independently found by the RATE specialist as RATE-06 (same defect, same nine-to-ten endpoint list, counted at ten because RATE-06 additionally counts an endpoint FILE-05's list folds into "with limits" — see Evidence).

## Expected Behavior

limits: { fileSize, files: 1 } on every FileInterceptor, sized to the endpoint, so multer aborts the stream at the boundary and never allocates the body.

## Actual Behavior

Any authenticated user with an upload permission can POST an arbitrarily large multipart body. The API buffers all of it, then returns 400 "exceeds the allowed size limit" — after the allocation. A handful of concurrent 1 GB posts exhausts the heap and kills the single production instance.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**FILE-05** (documents, employees, attendance, timesheets, payroll, data-management, recruitment controllers):

MulterModule is never registered anywhere (grep -rn "MulterModule" services/api/src → no hits), and main.ts sets no multipart limit — its body parsers are JSON/urlencoded only and do not apply to multipart/form-data:
```
services/api/src/main.ts:154-155
  const jsonParser = json({ limit: '1mb' });
  const urlencodedParser = urlencoded({ extended: true, limit: '1mb' });
```

Four endpoints set limits on the interceptor. Nine do not:
```
documents.controller.ts:139               @UseInterceptors(FileInterceptor('file'))
employees.controller.ts:147,590,608,695   @UseInterceptors(FileInterceptor('file'))
attendance.controller.ts:290              @UseInterceptors(FileInterceptor('file'))
timesheets.controller.ts:407              @UseInterceptors(FileInterceptor('file'))
payroll-operations.controller.ts:237,251  @UseInterceptors(FileInterceptor('file'))
data-management.controller.ts:133         @UseInterceptors(FileInterceptor('file'))
candidates.controller.ts:100              @UseInterceptors(FileInterceptor('file'))
```
(with limits: contracts.controller.ts:85,97 10 MB; support-cases.controller.ts:99 10 MB; tenant-settings.controller.ts:60 3 MB; release-publisher.controller.ts:125 512 MB.)

Nest's default multer storage is memory storage, so file.buffer holds the whole upload before any handler runs. The size check is downstream of that:
```
services/api/src/modules/employees/employee-profiles.service.ts:2058
  if (file.size > this.storageService.getMaxUploadBytes()) {
services/api/src/modules/documents/documents.service.ts:758-762
  const effectiveMaxBytes = Math.min(configuredMaxBytes, technicalMaxBytes);
  if (file.size > effectiveMaxBytes) {
```
Attendance import has no size check at all, and then doubles the memory by stringifying the buffer:
```
services/api/src/modules/attendance/attendance.service.ts:4952-4969
  function validateImportFile(file) {
    if (!file) throw ...
    if (!ATTENDANCE_IMPORT_MIME_TYPES.includes(file.mimetype) &&
        !file.originalname.toLowerCase().endsWith('.csv')) throw ...
    return file;          // <- no size assertion
  }
services/api/src/modules/attendance/attendance.service.ts:2490
  const rows = parseCsv(validatedFile.buffer.toString('utf8'));
```

The process is capped at 1.5 GB: services/api/package.json → "start:prod": "node --max-old-space-size=1536 dist/src/main.js".

---


Full finding text: FILE-05 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/FILE.md`; RATE-06 (same defect, from the abuse/rate-limiting angle rather than the storage angle) in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RATE.md`.

## Root Cause

Nine of ten upload endpoints had no multipart limit, so a whole file was buffered in memory before the service-level size check ran.

## Impact

Trivial denial of service against the whole platform (one instance, all tenants) from any authenticated account. Also amplifies FILE-01: the OOM restart is exactly the event that wipes the ephemeral file store.

## Affected Areas

services/api/src/common

## Proposed Resolution

Add limits to the nine interceptors listed above; add a size assertion to validateImportFile in attendance.service.ts; stream the CSV parse rather than buffer.toString('utf8').

(Difficulty: LOW; Regression risk: LOW; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for documents, employees, attendance, timesheets, payroll, data-management, recruitment controllers (audit id FILE-05).

## Regression Coverage

services/api/src/common/storage/upload-endpoints-have-limits.spec.ts. REG-716, QA-PLATFORM-067. Removing the limit from the documents controller fails the guard and names the file.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `FILE-05` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/FILE.md`
- Audit finding `RATE-06` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RATE.md` (same defect, filed here rather than as a separate record)

## Resolution

ALREADY FIXED in the code (uploadLimits(category) on every upload controller) but with no regression test. Added a source guard that fails any controller accepting an uploaded file without limits. Not verified: whether multer uses memory storage for the 512 MB release-artifact route, which is token-gated but public; flagged for the owner.

Fixed on branch agent/dependency-alert-remediation (SESSION-0137). Premise re-verified against the code before changing it (2026-11-22).

## QA Retest

QA-PLATFORM-067 on the isolated database, 2026-11-22: passing with the fix and failing with it removed. Independent review pending.

Independent QA retest 2026-11-24 (SESSION-0137 reconciliation): upload-endpoints-have-limits.spec scans every controller with @UploadedFile(s) and fails unless each upload interceptor uses uploadLimits()/limits:; passes (>=10 controllers found).

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (FILE-05) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[api-architecture]]
- Regression — REG-716 (see the regression register)

<!-- GRAPH:END -->
- 2026-11-24 — FIXED → VERIFIED by independent QA (SESSION-0137 reconciliation).
