# Object Storage

How DijiPeople stores, retrieves and deletes files, and why it is built this
way. This document is the design contract for anything that persists bytes.

> **Last verified:** 2026-09-10
> **Verified against:** `services/api/src/common/storage/`, migration
> `20260910121838_add_object_storage_metadata`

---

## The problem this replaced

Every persistent business file was written to the API container's local
filesystem through a service that resolved `FILE_STORAGE_DIR` and fell back to a
path relative to the working directory when it was unset.

On the live Render service that variable was unset and no persistent disk was
attached, so uploaded bytes landed inside the deploy directory itself. Render
replaces that filesystem on every deploy, restart, instance replacement and plan
change. The database row survived holding a storage key that now pointed at
nothing, so the failure surfaced weeks later as a 404 on a document the UI still
listed — signed employment contracts, uploaded identity documents, payslip PDFs.

The full evidence is the 2026-09-10 technical audit, findings FILE-01 and
INF-05. The remediation record is
[`REMEDIATION-P0.md`](../engineering/audits/2026-09-10-full-technical-audit/REMEDIATION-P0.md).

---

## Shape

```
Browser / desktop agent
        │
        ▼
DijiPeople API
        ├── JwtAuthGuard              authentication, tenant from the token
        ├── PermissionsGuard          both permission systems
        ├── row/entity scope          buildScopedAccessWhere, access levels
        │
        ▼
Domain service  (documents, employees, payroll, contracts, …)
        │
        ▼
StorageService                        scope enforcement, checksum, error mapping
        │
        ▼
ObjectStorageProvider                 the seam
        ├── R2ObjectStorageProvider   production
        └── LocalObjectStorageProvider development and tests only

PostgreSQL
        └── document metadata: storageKey, storageProvider, checksum,
            MIME, size, original filename, owner, scan status
```

Business modules never see a provider, an SDK client or a bucket. They call
`StorageService`. That indirection is the whole reason a future move to S3,
Azure Blob or a sovereign-region store is a change in one module rather than a
rewrite of document logic.

---

## The two rules that matter

### Production cannot write to a disk

`resolveStorageConfig` refuses `STORAGE_PROVIDER=local` when `NODE_ENV` or
`APP_ENV` is production, and refuses to start at all when the provider is unset
there. `StorageModule` throws during construction rather than starting the
process.

There is no fallback chain anywhere in the module. When R2 is unavailable an
upload fails with `FILE_STORAGE_UNAVAILABLE` and nothing is written; the caller
must not persist a metadata row. "R2 failed, so write it to disk and return
success" is precisely the defect being remediated, and a test asserts that a
failed upload leaves the filesystem untouched.

### A storage key is not a capability

Before this work, knowing a key was equivalent to being authorized for it. Two
endpoints accepted one as request input and read it straight back, keys were
returned to browsers in document responses and written into audit snapshots, and
the only guard was a traversal check that stopped escape from the storage root
but not from the tenant prefix.

Two changes close that:

1. **A key is never client input.** It is always read from a row already fetched
   under a `tenantId` filter. `storageKey` was removed from the recruitment and
   app-release request bodies and from the document response shape.
2. **Every operation states a scope**, and the key is checked against it.

```ts
type StorageScope =
  | { kind: 'tenant'; tenantId: string }   // from request.user, never a DTO
  | { kind: 'platform' };                  // genuinely tenant-less artifacts
```

The second is defence in depth. It is what still holds if the first ever slips,
and it is what makes a leaked key useless against another tenant.

---

## Key layout

Keys are built in exactly one place, `storage-keys.ts`.

```
tenants/{tenantId}/{domain}/{...segments}/{yyyy}/{mm}/{uuid}{.ext}
platform/{domain}/{...segments}/{yyyy}/{mm}/{uuid}{.ext}
```

`domain` is a closed set. `segments` must be opaque identifiers matching
`[A-Za-z0-9._-]`; the builder throws on anything else rather than sanitising it,
so passing a filename fails loudly instead of leaking quietly.

**Nothing identifying goes in a key.** No name, email, phone, national id,
passport number, bank account, IBAN, tax id, salary or original filename. Keys
reach logs, bucket listings and the provider's own dashboard, none of which sit
behind DijiPeople authorization. The original filename is application metadata
in PostgreSQL, returned only to callers who passed authorization.

The date segments are for operational legibility when listing a prefix. They
carry no authorization meaning.

Contract documents and support-case attachments previously had no tenant
partition at all. They do now, which is what makes a per-tenant export or
migration of the file store possible for those areas.

---

## Uploads

Transport is API-proxied: the browser posts to DijiPeople, which streams to R2.
There is no direct browser-to-R2 upload, so the bucket needs no CORS policy and
the API stays the single authorization point.

Every multipart endpoint declares a size limit by content category through
`uploadLimits()`, enforced by multer at the stream boundary. The previous
implementation checked `file.size` inside the service, after the whole upload was
already in the heap — a limit that runs after the allocation is not a limit, and
a handful of concurrent large posts could exhaust the 1.5 GB process cap and
take down the single production instance.

| Category | Limit | Used by |
|---|---|---|
| `document` | 10 MB | tenant documents, employee documents |
| `image` | 5 MB | profile images |
| `brandingAsset` | 3 MB | logos, favicons, login imagery |
| `spreadsheet` | 15 MB | attendance, timesheet, payroll and data imports |
| `resume` | 10 MB | candidate CVs |
| `releaseArtifact` | 512 MB | desktop agent installers, platform staff only |

`files: 1` matters as much as `fileSize`. Without it a caller can send many files
that are each under the limit and nothing bounds them collectively.

A multer rejection is mapped to `FILE_TOO_LARGE` (413) by the exception filter.
Without that mapping it surfaces as a 500 and the UI cannot tell the user
anything useful.

---

## Downloads

The API streams bytes; it does not redirect to storage.

```
GET /documents/{id}/download
  → authenticate
  → resolve tenant from the token
  → load metadata under a tenantId filter
  → verify entity/row scope
  → verify permission
  → check tenant download settings
  → stream from the provider
```

Streaming rather than handing out a signed URL keeps `disableExternalDownloads`
and the audit trail applying to every retrieval. `getSignedDownloadUrl` exists on
the provider for future large-file flows and is clamped to at most 15 minutes,
but it is not on the default path.

A signed URL is an authorization artifact. Never persist one, never log one,
never store one in a database column.

Frontend proxies stream too. Both apps' `proxyApiFileResponse` passes the
response body straight through; previously they buffered every file into the
Next.js heap, which for a 512 MB installer was a process-sized allocation.

Upload proxies remain buffered on purpose — see the commit message on
`3b351032` for the duplex/retry reasoning.

---

## Metadata

Migration `20260910121838_add_object_storage_metadata` is expand-only: 26
nullable columns and one enum, no drops, no narrowing, no renames. Safe to apply
before the application deploy and safe to leave in place on rollback.

- **`storageProvider`** records which backend holds the bytes. `NULL` means the
  row predates object storage and its bytes were on the ephemeral filesystem.
  This is what lets reconciliation distinguish a legacy row from a durable one
  without guessing.
- **`checksumSha256`** is computed from the exact buffer that was sent, before
  the write, so it describes what was actually stored. Not the ETag: R2 and S3
  compute that differently for multipart uploads, so it is not a content hash.
- **`scanStatus`** is the malware-scan lifecycle.

Never store a permanent public object URL, and never store a signed URL. Store
durable identity — provider plus key — and resolve access at request time.

---

## Malware scanning

No scanner is wired. The tenant setting `documents.virusScanRequired` exists and
is inert, which is worse than having neither, because it tells an administrator
something untrue.

The lifecycle hooks are in place. Uploads record `SCAN_NOT_CONFIGURED` rather
than `CLEAN`, because a row asserting a file was scanned when nothing scanned it
is a lie that a future reader would rely on. The download path refuses
`QUARANTINED`. Introducing a real scanner is therefore a matter of writing
verdicts, not of changing every download.

```
PENDING → CLEAN | QUARANTINED | SCAN_FAILED
SCAN_NOT_CONFIGURED   (today, for every upload)
```

---

## Deletion and orphans

Deleting a document row does not always delete bytes, and that is correct:
payroll, contractual and legal records have retention requirements. Each domain
decides its own semantics.

Where bytes are deleted, `StorageService.deleteFile` throws if the store is
reachable but refuses, so the caller can record the orphan rather than lose track
of it. Callers doing best-effort cleanup after a failed upload catch it
explicitly.

Tenant erasure sweeps every tenant-scoped model that holds a key. It previously
swept two of fifteen, so candidate resumes and DLP screenshots of employees'
screens survived an erasure that reported success.

`npm run storage:reconcile` reports in both directions — rows whose object is
missing, and objects with no row. It is **report-only**. There is no automated
deletion, and adding one would require a grace period and independent
verification first: a single scan claiming something is an orphan is not
sufficient grounds to destroy a customer's document.

---

## Configuration

| Variable | Required | Notes |
|---|---|---|
| `STORAGE_PROVIDER` | yes in production | `r2` or `local`. `local` is rejected in production. |
| `R2_BUCKET_NAME` | with `r2` | |
| `R2_ENDPOINT` | with `r2` | must be https |
| `R2_ACCESS_KEY_ID` | with `r2` | |
| `R2_SECRET_ACCESS_KEY` | with `r2` | |
| `R2_ACCOUNT_ID` | recommended | not needed for S3 API access |
| `R2_REGION` | no | defaults to `auto` |
| `R2_REQUEST_TIMEOUT_MS` | no | defaults to 15000 |
| `R2_MAX_ATTEMPTS` | no | defaults to 3 |
| `FILE_UPLOAD_MAX_BYTES` | no | backstop ceiling |
| `FILE_STORAGE_DIR` | no | **development only**, `local` provider root |

Credentials are server-side only. No storage variable may ever be exposed as
`NEXT_PUBLIC_*` or reach browser code. The production bucket is private and
Public Access must stay disabled.

**Local development** defaults to the `local` provider with no configuration, so
nothing about R2 is needed to run the product. To exercise the real provider,
point at a separate development bucket. Automated tests must never write to the
production bucket.

---

## Operations

- **Is storage reachable?** `GET /api/platform/storage/readiness`, platform
  identity with `monitoring.read`. Not on `GET /health`, which is public and
  polled continuously.
- **`durable: false` in that response on a production instance** means the
  process is running on the filesystem provider and uploads are not durable.
- **Rotating credentials.** Update `R2_ACCESS_KEY_ID` and
  `R2_SECRET_ACCESS_KEY` on the service and redeploy. The client reads them at
  construction, so a running instance keeps the old pair until it restarts. Keep
  the old token valid until every instance has cycled.
- **Never** print, log, commit, screenshot or paste a credential into
  documentation, audit evidence or a test.

## Adding a provider later

Implement `ObjectStorageProvider`, add a branch in `StorageModule`'s factory and
a case in `resolveStorageConfig`. Nothing in `modules/` should need to change; if
it does, something has leaked past `StorageService` and that is the bug.

Note that the current R2 bucket carries no evidence about data residency for any
particular jurisdiction. Do not claim it satisfies a residency requirement
without that evidence.
