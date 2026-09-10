# Remediation — Durable file storage (FILE-01 / INF-05)

**Status:** IMPLEMENTED — NOT VERIFIED
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

`npm run storage:reconcile` produces measured counts by bucket
(`DURABLE`, `MISSING_IN_STORE`, `LEGACY_UNRECOVERABLE`, `NO_KEY`, `UNVERIFIED`).
**It has not yet been run against production**, so this record states no counts.
Any figure here that was not measured would be an invention.

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
not confirmed across a tenant boundary, and the provider is never called.

**Not yet proven end to end against a running system with two real tenants.**
That is part of the outstanding verification below.

## Restart/redeploy persistence verification

**NOT PERFORMED.** This is the acceptance condition for the P0 and it has not
been met yet. It requires: upload through the deployed application, confirm the
database row, confirm the object, download and verify contents, redeploy the API,
download again, confirm authorization still enforced.

## R2 failure test

Proven at the unit level: a provider that throws produces a 503, no metadata
result the caller could persist, and no filesystem write.

**Not yet proven against the deployed service** by removing or invalidating
configuration on a live instance.

## Independent reviewer findings

An adversarial review by an agent that did not write the implementation was
commissioned. Findings and their resolution are recorded below when it reports.

## Remaining risk

- **Malware scanning does not exist** (FILE-04). The tenant setting
  `documents.virusScanRequired` remains inert and now has lifecycle hooks behind
  it but no scanner. Uploads record `SCAN_NOT_CONFIGURED` rather than `CLEAN`.
- **Files uploaded before this change are gone.** No amount of code fixes that.
- **The bucket's public-access setting has not been read from Cloudflare.** No
  Cloudflare credential is available on this machine. It will be verified
  empirically instead, by attempting an unauthenticated fetch of a known object
  URL after deploy.
- **No data-residency claim is made.** The current bucket carries no evidence
  about any jurisdiction's requirements.
- **`storage-reconcile.mjs` has not been run against a populated database.**
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

`IMPLEMENTED — NOT VERIFIED`

It becomes `VERIFIED RESOLVED` only when the restart/redeploy persistence test
and the cross-tenant negative tests have actually passed against a deployed
system. Static inspection and unit tests are not sufficient for this finding,
because the defect being remediated was invisible to both.
