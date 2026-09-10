---
ID: BUG-3179
aliases: [BUG-3179]
Title: Nine/ten upload endpoints had no multipart size limit; the check ran after the whole file was already in the heap
Status: OPEN
Severity: HIGH
Priority: P1
Type: SECURITY
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/common]
OwnerAgent: architect
ArchitectDisposition: TRIAGE_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-10
ResolvedAt:
---

# BUG-3179 — Nine upload endpoints had no multipart size limit; the check ran after the whole file was already in the heap

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

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

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

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: FILE-05=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `FILE-05` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/FILE.md`
- Audit finding `RATE-06` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RATE.md` (same defect, filed here rather than as a separate record)

## Resolution

Closed by commit f4278f17: upload size limits enforced by multer at the stream boundary on the nine previously-unbounded multipart endpoints, including attendance import which had no size check at all. Left Status: OPEN pending a regression test and QA retest rather than claiming FIXED without a RegressionId.

## QA Retest

Not yet retested. Confirm each of the nine endpoints named in Evidence now rejects an oversized multipart body before buffering it.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (FILE-05) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
