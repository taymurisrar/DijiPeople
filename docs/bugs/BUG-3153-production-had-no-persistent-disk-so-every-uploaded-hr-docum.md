---
ID: BUG-3153
aliases: [BUG-3153]
Title: Production had no persistent disk, so every uploaded HR document was destroyed on the next deploy
Status: OPEN
Severity: CRITICAL
Priority: P0
Type: INFRA
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/common, services/api/src/modules/documents]
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

# BUG-3153 — Production had no persistent disk, so every uploaded HR document was destroyed on the next deploy

## Summary

Production had no persistent disk, so every uploaded HR document was destroyed on the next deploy

Identified by the 2026-09-10 full technical audit as FILE-01 / INF-05 (confidence: FILE-01=CONFIRMED, INF-05=LIKELY — the unverified link is whether the `disk:` block in `render.yaml` was ever applied to the live service. The evidence that `FILE_STORAGE_DIR` is unset live is a direct quotation of a live read; the inference that the disk is therefore also absent follows from INF-03 but was not read from the provider (read-only constraint).).

## Expected Behavior

**FILE-01:** Either the declared Render disk is actually attached and FILE_STORAGE_DIR=/var/data/storage is set on the service, or storage moves to an object store. Nothing else makes an uploaded contract durable.

**INF-05:** Uploads land on durable storage that survives a deploy.

## Actual Behavior

**FILE-01:** Every uploaded file — employee contracts and identity documents (documents, employees), generated payslip PDFs (payroll-output-document.service.ts:30), profile images, tenant branding logos, DLP screenshots of employee screens (dlp.service.ts:187), data-import source files and data-export artifacts, report artifacts, contract source documents, support-case attachments and published desktop-agent installers — is written to the container's ephemeral filesystem. Render replaces that filesystem on every deploy, every restart, every instance replacement and every plan change. The database row survives with a storageKey that now points at nothing; openFile throws NotFoundException('Stored file could not be found.'), so the failure surfaces as a 404 on a document the UI still lists.

**INF-05:** Every tenant document, branding asset, generated report artifact and published desktop-agent installer is written to a relative path inside an ephemeral container filesystem. Render replaces the container on every deploy. The release record confirms this has been true "for every existing upload".

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior. Multiple audit findings are consolidated into this record; each is independently traceable at its own citation.

## Evidence

**FILE-01** (services/api/src/common/storage/storage.service.ts, render.yaml, live Render service srv-d7js7fqqqhas739v4i7g):

render.yaml:52-60 declares the disk and the variable:
```yaml
    disk:
      name: dijipeople-storage
      mountPath: /var/data
      sizeGB: 5
    envVars:
      - key: FILE_STORAGE_DIR
        value: /var/data/storage
```

The live service has neither. Read-only Render API, 2026-09-10:
```
GET /v1/disks?serviceId=srv-d7js7fqqqhas739v4i7g   ->  []
GET /v1/services/srv-d7js7fqqqhas739v4i7g
    { "name":"DijiPeople", "plan":"standard", "numInstances":1,
      "rootDir":"services/api" }        # no `disk` key at all
GET /v1/services/.../env-vars           # 86 keys; FILE_STORAGE_DIR is NOT among them,
                                        # and neither is INVOICE_STORAGE_DIR
```

The project's own release record already said so and deferred it: docs/deployment/release-history/2026-08-31-production-cace6cd.md:69-73 — "FILE_STORAGE_DIR was deliberately **not** set: it is missing today for every existing upload too … That is a pre-existing platform question, not this release's to answer."

services/api/src/common/storage/storage.service.ts:20-22 — with the variable unset the root falls back to resolve(process.cwd(), 'storage/uploads'). Render's rootDir is services/api, so the bytes land in /opt/render/project/src/services/api/storage/uploads — inside the deploy directory itself.

---

**INF-05** (render.yaml, services/api/src/common/storage/storage.service.ts):

`render.yaml:33-44` states the design and the stake:
> Durable file storage (TASK-0025). StorageService writes uploaded files —
> tenant documents, branding assets, and published app-release installers —
> under FILE_STORAGE_DIR. **Without a persistent disk that path is on the
> instance's ephemeral filesystem and every deploy wipes it**, so a published
> agent installer (or any uploaded document) vanishes on the next deploy.

`docs/deployment/release-history/2026-08-31-production-cace6cd.md:56-58` —
live read, 2026-08-31, `FILE_STORAGE_DIR` in the **MISSING** column, and
lines 69-73 make it deliberate:
> `FILE_STORAGE_DIR` was deliberately **not** set: it is missing today for
> every existing upload too, and changing it would relocate where all existing
> files are read from. That is a pre-existing platform question, not this
> release's to answer.

`services/api/src/common/storage/storage.service.ts:21` shows the fallback:
```ts
this.configService.get('FILE_STORAGE_DIR') ?? 'storage/uploads',
```
— a relative path, resolved against the process working directory, i.e. inside
the container image.

---


Full finding text: FILE-01 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/FILE.md`; INF-05 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/INF.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

**FILE-01:** Silent, unrecoverable loss of the customer's HR records. Signed employment contracts, uploaded passports/IDs and payslip PDFs disappear on a routine deploy with no error, no alert and no backup (see FILE-13). For an HRM platform this is the loss of the customer's system of record for documents.

**INF-05:** Silent, total, recurring data loss on a customer-facing feature. A tenant uploads an employment contract; the next release deletes it; the database row still points at a file that no longer exists, so the failure surfaces as a broken download weeks later rather than as an error at the time. There is no backup of these bytes at all — INF-02's RPO row for file storage is 100% loss on every deploy, not "6 hours".

## Affected Areas

services/api/src/common, services/api/src/modules/documents

## Proposed Resolution

**FILE-01:** Apply render.yaml to the service (or set the disk and FILE_STORAGE_DIR in the dashboard) as an immediate stop-gap; then move StorageService behind an object-storage driver (S3/R2), because the disk pins the service to one instance forever — render.yaml:48-51 already says so. Also set INVOICE_STORAGE_DIR (FILE-14). Existing rows whose bytes are already gone need a reconciliation pass that marks them missing rather than 404-ing. (Difficulty: LOW for the disk; MEDIUM for object storage; Regression risk: MEDIUM — changing FILE_STORAGE_DIR relocates where every existing key is read from, which is exactly why it was deferred before; Fix now: YES)

**INF-05:** Two viable paths, and the second is the one to prefer:
1. Apply the `disk:` block from `render.yaml` and set `FILE_STORAGE_DIR` to `/var/data/storage`. This works today and permanently forecloses running more than one API instance (see the tradeoff comment at `render.yaml:37`). Existing files are already lost, so there is no migration to do — but say so explicitly rather than letting it look like a lossless change.
2. Move `StorageService` to object storage (S3 or Cloudflare R2) behind the same interface. It removes the single-instance pin, gives the bytes a provider-level durability guarantee, and makes the backup question answer itself. `render.yaml:37-42` already anticipates this as the scale-out path.
Whichever is chosen, **verify from the live service that it took effect** — that is the whole lesson of INF-03. (Difficulty: LOW for (1), MEDIUM for (2); Regression risk: LOW; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/src/common/storage/storage.service.ts, render.yaml, live Render service srv-d7js7fqqqhas739v4i7g (audit id FILE-01).
- The behaviour described in Expected Behavior holds for render.yaml, services/api/src/common/storage/storage.service.ts (audit id INF-05).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: FILE-01=MEDIUM — changing FILE_STORAGE_DIR relocates where every existing key is read from, which is exactly why it was deferred before, INF-05=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `FILE-01` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/FILE.md`
- Audit finding `INF-05` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/INF.md`

## Resolution

Closed by the durable object storage migration to Cloudflare R2 (commit f4278f17, "feat(storage): durable object storage on Cloudflare R2 (FILE-01/INF-05)"), independently verified against the live production service afterwards (commit ab4e36e4, "docs(remediation): FILE-01/INF-05 verified resolved on production" — uploaded a document through the deployed app, confirmed the row and the R2 object, replaced the API instance with a new deploy, downloaded the same bytes again byte for byte). Filed here, after the fact, because the audit observed correctly that no bug record tracked this CRITICAL finding while the fix was in flight — the same gap this record-creation pass exists to close. Left Status: OPEN rather than FIXED/VERIFIED because the record has no RegressionId yet and this pass is not QA; the Architect should move it to VERIFIED once a regression test exists and this record is linked to it.

## QA Retest

Already verified once in production per the remediation doc cited above. A repeatable regression test (upload -> replace instance -> download byte-identical) does not yet exist; add one and record it as RegressionId before moving this to VERIFIED.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (FILE-01, INF-05) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
