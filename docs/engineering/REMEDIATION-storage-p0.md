# Remediation — Durable file storage (FILE-01 / INF-05)

**Status:** VERIFIED RESOLVED (2026-09-10, on production)
**Session:** SESSION-0097
**Branch:** `agent/r2-durable-storage`
**Baseline:** `f55cf4b2`
**Source finding:** 2026-09-10 full technical health audit, FILE-01 (CRITICAL) and
INF-05 (CRITICAL), plus the storage-coupled findings listed below.

> **Why this file is here and not in the audit folder.** The audit itself is not
> on any pushed branch: its author judged that publishing a map of 281 mostly
> unpatched findings to a public repository was the maintainer's decision, not an
> agent's. This record covers only the storage findings, all of which are fixed
> in the branch it ships with, so it carries no exploitable information about
> anything still open.

---

## Original finding

Every persistent business file was written to the API container's local
filesystem by `StorageService`, which resolved `FILE_STORAGE_DIR` and fell back
to `storage/uploads` relative to the working directory when it was unset.

Verified against the live Render service on 2026-09-10, read-only:

| Check | Result |
|---|---|
| Disk attached to `srv-d7js7fqqqhas739v4i7g` | none |
| `FILE_STORAGE_DIR` on the service | absent |
| `STORAGE_PROVIDER` on the service | `r2` |
| `R2_BUCKET_NAME` | `dijipeople-prod-files` |
| R2 credentials present | all four, correct shapes |

Render's `rootDir` is `services/api`, so with the variable unset the bytes landed
in `/opt/render/project/src/services/api/storage/uploads` — inside the deploy
directory itself. Render replaces that filesystem on every deploy, restart,
instance replacement and plan change.

The R2 variables were already configured on the service while no code read them,
so production was silently ignoring durable storage that had already been paid
for and provisioned.

## Root cause

Three compounding causes, not one:

1. **An unset variable produced a plausible default.** A relative path inside an
   ephemeral container is a working configuration until the container is
   replaced, so nothing failed at the time of the mistake.
2. **`render.yaml` described a disk that was never applied.** The repository
   asserted durability that the running service did not have, and no check
   compared the two.
3. **The failure is silent and delayed.** The database row survives, so the loss
   surfaces weeks later as a 404 on a document the UI still lists, by which time
   the connection to a routine deploy is invisible.

The release record of 2026-08-31 had already noticed `FILE_STORAGE_DIR` was
missing and deferred it as "a pre-existing platform question, not this release's
to answer." That deferral was reasonable in isolation and wrong in aggregate.

## Discovered file flows

Fourteen persistent flows, discovered by inspection rather than from the audit:

| Feature | Model + key field | Scope |
|---|---|---|
| Tenant document vault | `Document.storageKey`, `DocumentVersion.storageKey` | tenant |
| Employee documents | `Document.storageKey` | tenant |
| Employee profile images | `Document.storageKey` | tenant |
| Payslip PDFs and payroll bank exports | `Document.storageKey` | tenant |
| Candidate CVs | `DocumentReference.storageKey` | tenant |
| Employee document references | `EmployeeDocumentReference.storageKey` | tenant |
| Contract source uploads | `ContractVersion.sourceStorageKey` | tenant via `Contract` |
| Generated/signed contracts | `ContractDocument.storageKey` | tenant via `Contract` |
| Signature evidence | `SignatureEvidence.signatureStorageKey` | tenant via `Contract` |
| Contract template sources | `ContractTemplateVersion.sourceStorageKey` | tenant |
| Support-case attachments | `SupportCaseAttachment.storageKey` | tenant via `SupportCase` |
| Data import/export artifacts | `DataJob.sourceFileKey`/`resultFileKey`/`errorFileKey` | tenant |
| Report export artifacts | `ReportRun.resultFileKey` | tenant |
| DLP screen captures | `ScreenCaptureEvent.storageKey` | tenant |
| Platform invoice PDFs | `Invoice.pdfStorageKey` | tenant |
| Desktop agent installers | `ApplicationRelease.storageKey` | platform |

Temporary and safe, left on the filesystem deliberately: platform log files
(`DIJIPEOPLE_LOG_DIR`, an operational log viewer, not business data), and the
build/dev-only scripts `invoice-pdf.sample.ts`, `migration-drift.ts` and
`schema-unique-drift.ts`.

## Architecture implemented

```
Domain services → StorageService → ObjectStorageProvider
                                    ├── R2ObjectStorageProvider   (production)
                                    └── LocalObjectStorageProvider (dev/test)
```

Documented in full at [`../architecture/object-storage.md`](../architecture/object-storage.md).

Two properties carry the remediation:

- **Production cannot select the filesystem provider.** `resolveStorageConfig`
  rejects `local` when `NODE_ENV` or `APP_ENV` is production and rejects an
  unset provider there. `StorageModule` throws during construction. There is no
  fallback chain anywhere in the module, so an R2 outage fails the upload rather
  than writing somewhere ephemeral and reporting success.
- **A storage key is no longer a capability.** Keys are never client input, and
  every operation states a scope that the key is checked against.

## Files changed

60 files across four commits: `f4278f17`, `3b351032`, `8631a133`, `812eeedc`.

New: the storage core (`services/api/src/common/storage/`), the readiness
controller, `scripts/storage-reconcile.mjs`,
`docs/architecture/object-storage.md`.

Changed: 16 domain services migrated to the scoped API, 9 controllers given
upload limits, the exception filter, the error catalog, both frontends'
file proxies, and the environment registration set.

## Schema changes

One migration, `20260910121838_add_object_storage_metadata`. Expand-only: 26
nullable columns and one enum, no drops, no narrowing, no renames. Adding a
nullable column without a default does not rewrite the table in PostgreSQL, so
there is no long lock on `Document` or `Invoice`. Safe to apply before the
application deploy and safe to leave in place on rollback.

`storageProvider` on each key-bearing model records which backend holds the
bytes. `NULL` means the row predates object storage, which is what lets
reconciliation distinguish a legacy row from a durable one without guessing.

## Infrastructure changes

`render.yaml` no longer declares the disk that was never applied. R2 credentials
are declared `sync: false` so Render requires them from the dashboard and no
value is committed. The variables were already set on the live service before
this work began; nothing about the service's secrets was changed.

## Existing file migration

**None performed, by explicit decision, and none is possible.**

The live service never had a persistent disk, so bytes written before this change
were destroyed by the deploys that have already happened. There is nothing to
migrate. Rows pointing at them are left untouched: the maintainer chose
report-only so that no customer-visible record changes before they decide what to
tell customers.

### Measured counts

Read from the production database on 2026-09-10, after the release:

| Model | Rows holding a storage key | Provider |
|---|---|---|
| `ContractDocument` | 11 | all `NULL` |
| `Document` | 1 | all `NULL` |
| `Invoice` (pdf) | 1 | all `NULL` |
| `ReportRun` | 1 | all `NULL` |
| `DocumentReference`, `EmployeeDocumentReference`, `SupportCaseAttachment`, `ApplicationRelease` | 0 | — |
| **Total** | **14** | **all `LEGACY_UNRECOVERABLE`** |

Every pre-existing row has `storageProvider = NULL`, meaning its bytes were
written to the container filesystem and were destroyed by a deploy that has
already happened. **Nothing is recoverable and nothing was changed.** The
eleven contract documents are the group worth a product decision; this record
does not make one.

`npm run storage:reconcile` produces the same classification
(`DURABLE`, `MISSING_IN_STORE`, `LEGACY_UNRECOVERABLE`, `NO_KEY`, `UNVERIFIED`)
and can also compare in the bucket→database direction, which needs a Cloudflare
token this environment does not have.

## Tests added

| Suite | Covers |
|---|---|
| `storage-keys.spec.ts` | 26 tests: tenant prefix confusion, traversal in raw and encoded forms, absolute and protocol-relative URLs, platform boundary both directions, PII never reaching a key |
| `storage.config.spec.ts` | production rejects `local` and an unset provider, each required R2 variable, plaintext endpoint, no fallback field on the config |
| `storage.service.spec.ts` | outage fails the upload with nothing saved and no filesystem write, outage distinguishable from not-found, cross-tenant read/delete/exists refused, size and empty-file limits, checksum correctness, signed-URL clamping, local provider containment |

Both scoping protections were **mutation-tested**: removing the prefix separator
and removing the traversal rejection each make the suite fail. A security test
that still passes after the protection is deleted is worse than no test.

## Upload security

Nine previously unbounded multipart endpoints now declare a limit by content
category, enforced by multer at the stream boundary rather than after the body is
in the heap. `files: 1` is set alongside `fileSize`, without which many
under-limit files are collectively unbounded. Attendance import had no size check
at all and stringified the buffer, doubling memory. Multer rejections map to 413
instead of 500.

## Tenant isolation verification

Proven by unit test at the storage layer: cross-tenant read, delete and existence
checks are refused, reported as not-found rather than forbidden so existence is
not confirmed across a tenant boundary, and the provider is never called. Both
the prefix check and the traversal rejection were mutation-tested — removing
either makes the suite fail.

Confirmed structurally in production: the object written by the persistence test
sits under `tenants/{tenantId}/`, so the partition the scope check relies on is
real rather than assumed.

**Not exercised end to end with two live tenants.** That needs a second
provisioned tenant and a document in each, and the demo tenant is the only one
available here. The storage layer refuses the crossing regardless of caller, and
that refusal is what the unit tests cover.

## Restart/redeploy persistence verification

**PASSED on production, 2026-09-10.** This is the acceptance condition for the
P0, and it is the only evidence that actually settles it — the defect was
invisible to static inspection and to the test suite for months.

| Step | Result |
|---|---|
| Upload through the deployed API, demo tenant | document `103fe528…` created |
| `storageProvider` on the row | `r2` |
| `scanStatus` on the row | `SCAN_NOT_CONFIGURED` |
| `checksumSha256` recorded | yes, `625f9212…` |
| Key is tenant-prefixed | yes, `tenants/{tenantId}/documents/…` |
| Object present in the bucket | yes, 68 B, `application/pdf` |
| Download through the app before redeploy | byte-for-byte match |
| **API instance replaced** | new deploy reached `live`, served commit `6b2cd00` |
| **Download after replacement** | **byte-for-byte match** |
| Anonymous download, both before and after | refused, 401 |

The same bytes were readable through the application after a completely new
container took traffic. Under the previous implementation they would have been
destroyed by that deploy.

`storageKey` was absent from the upload response, confirming the FILE-18 fix
holds in production and not just in the unit test.

**Bucket privacy** is confirmed from two directions: an unauthenticated fetch of
the object's endpoint URL is refused, and the Cloudflare dashboard reports
`Public Access: Disabled` for `dijipeople-prod-files`.

## R2 failure test

Proven at the unit level: a provider that throws produces a 503, no metadata
result the caller could persist, and no filesystem write.

**Not exercised against the deployed service.** Doing so means invalidating
storage configuration on the live instance, which would break uploads for real
tenants for the duration. The boot-time behaviour is proven in the other
direction instead: the API refuses to start when storage configuration is
invalid, and it did start, so the configuration validated.

## Independent reviewer findings

An adversarial review by an agent that did not write the implementation found
four real defects, all confirmed against the source before being fixed
(`c15e95d5`):

1. **Candidate documents leaked their storage keys.** `mapCandidate` spread the
   Prisma row into the response and the include has no `select`, so
   `storageKey`, `storageProvider` and `checksumSha256` reached every caller
   holding `recruitment.read`. Fixed with an explicit projection, guarded by
   `candidate-document-projection.spec.ts`, which was mutation-tested.
2. **`contentType` was free text from the request body**, and the download route
   sends it as the response `Content-Type` with an inline disposition — so a
   recruiter could register stored bytes as `text/html`. Now copied from the
   validated source document and removed from the DTO.
3. **The general document allowlist still accepted `image/svg+xml`.** The same
   stored-XSS shape had been closed for branding assets earlier in this branch;
   the vault every module uploads through was missed.
4. **Report exports were tenant-scoped but not requester-scoped**, so a run id
   from a schedule email read a colleague's export.

Three of the four are one mistake: the fix was applied where the finding pointed
rather than everywhere the pattern lived.

An earlier review attempt died on an account rate limit partway through. A
self-review in the interval found three further defects — two upload endpoints
with no size limit at all, three with a size cap but no file count, and a
staging environment that could have selected ephemeral storage.

## Remaining risk

- **Malware scanning does not exist** (FILE-04). The tenant setting
  `documents.virusScanRequired` remains inert and now has lifecycle hooks behind
  it but no scanner. Uploads record `SCAN_NOT_CONFIGURED` rather than `CLEAN`.
- **The 14 files uploaded before this change are gone**, including eleven
  contract documents. No code fixes that, and no row was altered. What to tell
  affected customers is a product decision this record does not make.
- **No Cloudflare API access from this environment.** Bucket settings cannot be
  read or asserted programmatically, so nothing verifies that Public Access
  stays disabled, or that a lifecycle rule is not added later that expires
  objects. Confirmed once by dashboard and once by an unauthenticated probe;
  neither is a standing check. A read-only R2 token would close this.
- **The reverse reconciliation direction is unverified.** Objects in the bucket
  with no database row cannot be found without bucket listing, which needs that
  same token. The database→object direction was measured.
- **The R2 outage path is not exercised in production**, only in unit tests, for
  the reason given above.
- **Cross-tenant isolation is not proven with two live tenants**, only at the
  storage layer.
- **No data-residency claim is made.** The current bucket carries no evidence
  about any jurisdiction's requirements.
- Two other scripts share the bare `new PrismaClient()` bug found while building
  the reconciliation tool; they were left alone as out of scope.

## Rollback procedure

The schema migration is expand-only, so reverting application code requires no
schema change and no data movement. Reverted code reads the same rows it did
before; the added columns are simply ignored.

The one thing a rollback does **not** do is make files uploaded after R2 was
enabled readable by the old code, because the old code reads the filesystem. If a
rollback is needed after uploads have occurred, roll back the application but
leave the migration and the R2 configuration in place, and treat any post-cutover
upload as reachable only once the new code is restored.

**Never** re-point `FILE_STORAGE_DIR` at a disk as a rollback: that recreates
FILE-01.

## Status

`VERIFIED RESOLVED`

The acceptance condition was never "the code looks right" or "the tests pass" —
both were true of the broken implementation for months. It was that a persistent
document survives replacement of the API compute instance. On 2026-09-10 a
document was uploaded through the deployed application, the instance was
replaced by a new deploy, and the same bytes were downloaded again through the
application's own authorization path.

What this status does **not** claim, listed under Remaining risk above: the R2
outage path is proven only by unit test, cross-tenant isolation is proven only at
the storage layer rather than with two live tenants, and no standing check
asserts the bucket stays private. Those are bounded gaps in verification, not in
the fix.

The fourteen files lost before this change remain lost. That is the cost of the
defect having gone unnoticed, and it is not something this remediation recovers.
