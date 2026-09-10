# FILE — File and Object Storage

Auditor area: file and object storage. Repository worktree
`D:/My Work/hrm-dijipeople/dijipeople-audit`, branch `agent/full-technical-audit`,
commit `f55cf4b2`.

## Summary of how storage actually works

There is **exactly one storage backend**: the local POSIX filesystem, through
`services/api/src/common/storage/storage.service.ts`. There is no S3, no Azure
Blob, no GCS, no Cloudinary, no MinIO, no Supabase — `@aws-sdk`, `S3Client`,
`BlobServiceClient`, `cloudinary`, `@google-cloud/storage`, `minio` and
`supabase` return **zero** matches across `services/api/src`, `packages` and
`apps`. There are no `Bytes` columns in `schema.prisma` and no base64 blob
columns; every file model carries a `storageKey String` that names a path
relative to `FILE_STORAGE_DIR`.

```
services/api/src/common/storage/storage.service.ts:18-23
  getStorageRoot() {
    return resolve(
      process.cwd(),
      this.configService.get('FILE_STORAGE_DIR') ?? 'storage/uploads',
    );
  }
```

A second, undeclared root exists for invoice PDFs
(`INVOICE_STORAGE_DIR`, default `cwd/storage/generated`) and a third for
platform log files (`DIJIPEOPLE_LOG_DIR`).

Fourteen call sites read files back through `StorageService.openFile()`; sixteen
write through `saveFile()`. Everything that produces or consumes a stored file
in this product goes through those two functions, plus three direct
`readFile`/`writeFile` sites in `super-admin`, `contracts` and
`platform-communications`.

---

### FILE-01 — Production has no persistent disk, so every uploaded HR document is destroyed on the next deploy

- **Category:** Data Loss / Deployment
- **Severity:** CRITICAL
- **Confidence:** CONFIRMED
- **Known:** NEW (adjacent to BUG-0767, which recorded that `render.yaml` is not what production runs, but not this consequence)
- **Component:** `services/api/src/common/storage/storage.service.ts`, `render.yaml`, live Render service `srv-d7js7fqqqhas739v4i7g`
- **Evidence:**

  `render.yaml:52-60` declares the disk and the variable:
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

  The project's own release record already said so and deferred it:
  `docs/deployment/release-history/2026-08-31-production-cace6cd.md:69-73` —
  "`FILE_STORAGE_DIR` was deliberately **not** set: it is missing today for every
  existing upload too … That is a pre-existing platform question, not this
  release's to answer."

  `services/api/src/common/storage/storage.service.ts:20-22` — with the variable
  unset the root falls back to `resolve(process.cwd(), 'storage/uploads')`.
  Render's `rootDir` is `services/api`, so the bytes land in
  `/opt/render/project/src/services/api/storage/uploads` — inside the deploy
  directory itself.

- **Current behaviour:** Every uploaded file — employee contracts and identity
  documents (`documents`, `employees`), generated payslip PDFs
  (`payroll-output-document.service.ts:30`), profile images, tenant branding
  logos, DLP screenshots of employee screens (`dlp.service.ts:187`), data-import
  source files and data-export artifacts, report artifacts, contract source
  documents, support-case attachments and published desktop-agent installers —
  is written to the container's ephemeral filesystem. Render replaces that
  filesystem on every deploy, every restart, every instance replacement and
  every plan change. The database row survives with a `storageKey` that now
  points at nothing; `openFile` throws `NotFoundException('Stored file could not
  be found.')`, so the failure surfaces as a 404 on a document the UI still
  lists.
- **Expected behaviour:** Either the declared Render disk is actually attached and
  `FILE_STORAGE_DIR=/var/data/storage` is set on the service, or storage moves to
  an object store. Nothing else makes an uploaded contract durable.
- **Risk:** Silent, unrecoverable loss of the customer's HR records. Signed
  employment contracts, uploaded passports/IDs and payslip PDFs disappear on a
  routine deploy with no error, no alert and no backup (see FILE-13). For an HRM
  platform this is the loss of the customer's system of record for documents.
- **Remediation:** Apply `render.yaml` to the service (or set the disk and
  `FILE_STORAGE_DIR` in the dashboard) as an immediate stop-gap; then move
  `StorageService` behind an object-storage driver (S3/R2), because the disk
  pins the service to one instance forever — `render.yaml:48-51` already says so.
  Also set `INVOICE_STORAGE_DIR` (FILE-14). Existing rows whose bytes are already
  gone need a reconciliation pass that marks them missing rather than 404-ing.
- **Difficulty:** LOW for the disk; MEDIUM for object storage
- **Regression risk:** MEDIUM — changing `FILE_STORAGE_DIR` relocates where every
  existing key is read from, which is exactly why it was deferred before
- **Fix now:** YES

---

### FILE-02 — Any tenant's branding asset is served unauthenticated from any tenant's origin, inline, and SVG is an accepted type

- **Category:** AuthZ / Stored XSS / Tenant Isolation
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/tenants/public-tenants.controller.ts`, `apps/web/app/api/public/tenants/[tenantSlug]/assets/[assetType]/route.ts`, `services/api/src/modules/tenant-settings/branding-assets.service.ts`
- **Evidence:**

  The route is `@Public()` and takes the tenant slug from the path:
  ```
  services/api/src/modules/tenants/public-tenants.controller.ts:34-40
    @Public()
    @Get(':tenantSlug/assets/:assetType')
    async getBrandingAsset(@Param('tenantSlug') tenantSlug: string, ...)
  ```

  It serves the stored MIME type inline:
  ```
  services/api/src/modules/tenants/public-tenants.controller.ts:54-61
    response.setHeader('Content-Type', asset.document.mimeType ?? 'application/octet-stream');
    response.setHeader('Content-Disposition', `inline; filename="${asset.document.originalFileName}"`);
  ```

  The only content check is a prefix match, which `image/svg+xml` passes:
  ```
  services/api/src/modules/tenants/public-tenants.service.ts:196-200
    if (!document?.storageKey ||
        !document.mimeType?.toLowerCase().startsWith('image/')) {
      return null;
    }
  ```

  SVG is explicitly allowed on the branding upload:
  ```
  services/api/src/modules/tenant-settings/branding-assets.service.ts:50-56
    const IMAGE_MIME_TYPES = ['image/png','image/jpeg','image/jpg','image/webp','image/svg+xml'] as const;
  ```

  The tenant app proxies it from **its own origin** with the slug passed through
  and no check that the slug matches the host:
  ```
  apps/web/app/api/public/tenants/[tenantSlug]/assets/[assetType]/route.ts:28-37
    const response = await apiRequest(
      `/public/tenants/${encodeURIComponent(tenantSlug)}/assets/${encodeURIComponent(assetType)}`,
      { includeAuth: false },
    );
    ...
    return proxyApiFileResponse(response);
  ```
  and `proxyApiFileResponse` forwards `content-type` and `content-disposition`
  verbatim (`apps/web/lib/server-api.ts:486-487`).

  The API's CSP is Report-Only, so it blocks nothing
  (`packages/config/security-headers.js:98-116`, and the `apps/web` header set
  ships `Content-Security-Policy-Report-Only` at line 168-171). `nosniff` does
  not help: `image/svg+xml` is the *correct* type for the bytes, and browsers
  execute script in an SVG document navigated to directly.

  Verified reachable in production (unauthenticated, returns 404/400 rather than
  401):
  ```
  GET https://dijipeople.onrender.com/api/public/tenants/demo/assets/logo  -> HTTP/1.1 404
  ```

- **Current behaviour:** Two separate problems in one endpoint.
  1. **Cross-tenant read by design.** `GET /api/public/tenants/<slug>/assets/logo`
     serves tenant *A*'s uploaded file to anyone on the internet, and the tenant
     app proxy will serve tenant A's asset from tenant *B*'s hostname. There is no
     host↔slug check anywhere in the chain.
  2. **Stored XSS.** A tenant administrator uploads `logo.png` whose multipart
     `Content-Type` is `image/svg+xml` (the extension allowlist checks the
     filename, the MIME allowlist checks the declared header, and they are checked
     independently — see FILE-06). It is stored with `mimeType = image/svg+xml`
     and served `inline` with that type. Navigating to
     `https://<tenantB>.<domain>/api/public/tenants/<tenantA>/assets/logo` executes
     the attacker's script **on tenant B's origin**, where the session cookie is
     scoped (`AUTH_COOKIE_DOMAIN` is set on the live service) and every
     `app/api/*` proxy attaches it server-side. The script cannot read the
     httpOnly cookie but can issue same-origin authenticated requests through
     those proxies and exfiltrate the response.
- **Expected behaviour:** Reject `image/svg+xml` for branding, or sanitise it and
  serve it as `Content-Type: image/svg+xml; Content-Security-Policy: sandbox` with
  `Content-Disposition: attachment`. The public asset route should additionally
  refuse a slug that does not match the requesting workspace host.
- **Risk:** Session-riding account takeover of any user of any tenant, delivered
  by a link. The attacker only needs one tenant account with branding-settings
  access — which a trial/self-serve signup grants.
- **Remediation:** Drop `image/svg+xml` from `IMAGE_MIME_TYPES` and
  `FAVICON_MIME_TYPES` in `branding-assets.service.ts`, and from
  `ALLOWED_DOCUMENT_MIME_TYPES` in `documents.service.ts:41-50`. Force
  `Content-Disposition: attachment` on every non-image-raster type, and add
  `X-Content-Type-Options: nosniff` to the API's own responses. Add a
  host↔slug assertion in
  `apps/web/app/api/public/tenants/[tenantSlug]/assets/[assetType]/route.ts`.
- **Difficulty:** LOW
- **Regression risk:** LOW — an existing SVG logo would need re-upload as PNG
- **Fix now:** YES

---

### FILE-03 — Two endpoints accept a caller-supplied `storageKey` and read it back with no tenant-prefix check

- **Category:** AuthZ / Tenant Isolation
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/recruitment/*`, `services/api/src/modules/app-releases/app-release.controller.ts`
- **Evidence:**

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

  The same shape exists on the release catalogue, which is **not tenant-scoped**
  at all:
  ```
  services/api/src/modules/app-releases/app-release.controller.ts:76
    @IsOptional() @IsString() @MaxLength(500) storageKey?: string;
  services/api/src/modules/app-releases/app-release.service.ts:221-222
    if (release.storageKey) {
      const file = await this.storage.openFile(release.storageKey);
  ```
  `POST /app-releases` requires `appDownloads.manage`, which a tenant
  System Admin holds (`BASE_ROLE_PERMISSION_KEYS['system-admin'] =
  NON_CUSTOMIZATION_PERMISSION_KEYS`, `permissions.ts:2187`).

  The traversal guard is real but only contains the key to the storage root —
  it does not scope it to a tenant:
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
  and written into audit snapshots (`documents.service.ts:433-441`,
  `beforeSnapshot: this.mapDocument(document)`), and the frontend round-trips one
  back to the API by design (`apps/web/app/(authenticated)/recruitment/_components/cv-upload-parse-flow.tsx:536`
  `storageKey: uploadResult.storageKey`).

- **Current behaviour:** `storageKey` is a bearer capability for the *whole* file
  store. Any caller who can register a candidate document (Recruiter-level
  `recruitment.update`) or publish an app release (`appDownloads.manage`) can name
  any key under `FILE_STORAGE_DIR` — including
  `<other-tenant-id>/employees/<id>/documents/…` — and stream the bytes back with
  no document-level, employee-level or tenant-level authorization applied. The
  path-traversal guard stops escape from the root but not from the tenant prefix.
  It also defeats FILE-08: an "archived" document's key still resolves.
- **Expected behaviour:** `storageKey` must never be client input. The register
  step should take the *document id* produced by `/documents/upload` and resolve
  the key server-side; `openFile` should take a required tenant prefix and refuse
  a key that does not start with it.
- **Risk:** Full authorization bypass on stored files within a tenant (a recruiter
  reads HR-only contracts), and cross-tenant read of any file whose key has
  leaked. Keys are random UUIDs so they cannot be guessed, but they are returned
  to browsers, stored in audit rows, and echoed through the recruitment flow —
  they are not treated as secrets anywhere.
- **Remediation:** Remove `storageKey` from `RegisterCandidateDocumentDto` and
  from the app-release publish DTO; have `registerCandidateDocument` accept
  `documentId` and read `Document.storageKey` under a `tenantId` filter. Add a
  `tenantPrefix` parameter to `StorageService.openFile` and assert
  `normalizedKey.startsWith(prefix + '/')`. Strip `storageKey` from
  `mapDocument` and from audit snapshots.
- **Difficulty:** MEDIUM (the frontend CV flow changes with it)
- **Regression risk:** MEDIUM
- **Fix now:** YES

---

### FILE-04 — No malware scanning exists anywhere, and the tenant setting that claims it does is inert

- **Category:** Security / Product Integrity
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW (the *class* is known — BUG-1974, settings with no reader — but `documents.virusScanRequired` is not among the keys that record dispositioned)
- **Component:** `services/api/src/modules/tenant-settings/*`, every upload path
- **Evidence:**

  A case-insensitive search for `clamav|clamd|virus|malware|antivirus|virustotal|scanFile`
  over `services/api/src`, `packages` and `apps` returns **five** hits, all of
  them the setting and its label — no scanner, no client, no queue, no hook:
  ```
  services/api/src/modules/tenant-settings/tenant-settings-resolver.service.ts:307   virusScanRequired: boolean;
  services/api/src/modules/tenant-settings/tenant-settings-resolver.service.ts:1216  virusScanRequired: booleanValue(category.virusScanRequired, false),
  services/api/src/modules/tenant-settings/tenant-settings.catalog.ts:531            virusScanRequired: false,
  apps/web/app/(authenticated)/settings/_lib/settings-page-config.ts:1811            key: "virusScanRequired",  label: "Virus scan required",  type: "checkbox",
  ```
  `grep -rn "virusScanRequired" services/api/src apps` returns exactly those
  four lines: the value is resolved into `getDocumentSettings()` and never read
  by `validateUploadedFile` or by any other upload path.

  It is not in the honest "unbuilt" list either — the dispositions file records
  `documents.compressionEnabled`, `encryptDocuments`, `watermarkDownloads`,
  `requireOwner`, `requireExpiryDate`, `requireEffectiveDate` and
  `requireClassification` as `NOT_IMPLEMENTED`
  (`services/api/src/modules/tenant-settings/tenant-settings-dispositions.ts:269-275`)
  but **not** `virusScanRequired`. The checkbox therefore ships as a working
  control.

- **Current behaviour:** Uploaded bytes are never inspected. A tenant admin who
  ticks "Virus scan required" changes nothing at all.
- **Expected behaviour:** Either scan (ClamAV sidecar, or an async scan-then-release
  state on the document) or withdraw the control and disposition the key
  `NOT_IMPLEMENTED` like its six siblings.
- **Risk:** The platform ingests CVs from job applicants and identity documents
  from employees — attacker-supplied files from outside the tenant's trust
  boundary — stores them, and hands them back to HR staff to open on their
  workstations. Malware distribution through the HR document library is the
  direct consequence. The inert setting makes it worse than a plain absence,
  because the customer has been shown a control that says they are protected.
- **Remediation:** Withdraw the setting immediately (one line in
  `tenant-settings-dispositions.ts` plus removing the field from
  `settings-page-config.ts`), and open a backlog item for actual scanning at
  `StorageService.saveFile`.
- **Difficulty:** LOW to withdraw, HIGH to implement scanning
- **Regression risk:** LOW
- **Fix now:** YES (the withdrawal); LATER (the scanner)

---

### FILE-05 — Nine upload endpoints have no multipart size limit; the size check runs after the whole file is already in the heap

- **Category:** Availability / DoS
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW (related to ITEM-0123, which covers multer's own DoS advisories, not this)
- **Component:** `documents`, `employees`, `attendance`, `timesheets`, `payroll`, `data-management`, `recruitment` controllers
- **Evidence:**

  `MulterModule` is never registered anywhere (`grep -rn "MulterModule" services/api/src` → no hits), and `main.ts` sets no multipart limit — its body parsers are JSON/urlencoded only and do not apply to `multipart/form-data`:
  ```
  services/api/src/main.ts:154-155
    const jsonParser = json({ limit: '1mb' });
    const urlencodedParser = urlencoded({ extended: true, limit: '1mb' });
  ```

  Four endpoints set `limits` on the interceptor. **Nine do not**:
  ```
  documents.controller.ts:139               @UseInterceptors(FileInterceptor('file'))
  employees.controller.ts:147,590,608,695   @UseInterceptors(FileInterceptor('file'))
  attendance.controller.ts:290              @UseInterceptors(FileInterceptor('file'))
  timesheets.controller.ts:407              @UseInterceptors(FileInterceptor('file'))
  payroll-operations.controller.ts:237,251  @UseInterceptors(FileInterceptor('file'))
  data-management.controller.ts:133         @UseInterceptors(FileInterceptor('file'))
  candidates.controller.ts:100              @UseInterceptors(FileInterceptor('file'))
  ```
  (with limits: `contracts.controller.ts:85,97` 10 MB; `support-cases.controller.ts:99` 10 MB;
  `tenant-settings.controller.ts:60` 3 MB; `release-publisher.controller.ts:125` 512 MB.)

  Nest's default multer storage is memory storage, so `file.buffer` holds the
  whole upload before any handler runs. The size check is downstream of that:
  ```
  services/api/src/modules/employees/employee-profiles.service.ts:2058
    if (file.size > this.storageService.getMaxUploadBytes()) {
  services/api/src/modules/documents/documents.service.ts:758-762
    const effectiveMaxBytes = Math.min(configuredMaxBytes, technicalMaxBytes);
    if (file.size > effectiveMaxBytes) {
  ```
  Attendance import has **no size check at all**, and then doubles the memory by
  stringifying the buffer:
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

  The process is capped at 1.5 GB: `services/api/package.json` →
  `"start:prod": "node --max-old-space-size=1536 dist/src/main.js"`.

- **Current behaviour:** Any authenticated user with an upload permission can
  POST an arbitrarily large multipart body. The API buffers all of it, then
  returns 400 "exceeds the allowed size limit" — after the allocation. A handful
  of concurrent 1 GB posts exhausts the heap and kills the single production
  instance.
- **Expected behaviour:** `limits: { fileSize, files: 1 }` on every
  `FileInterceptor`, sized to the endpoint, so multer aborts the stream at the
  boundary and never allocates the body.
- **Risk:** Trivial denial of service against the whole platform (one instance,
  all tenants) from any authenticated account. Also amplifies FILE-01: the OOM
  restart is exactly the event that wipes the ephemeral file store.
- **Remediation:** Add `limits` to the nine interceptors listed above; add a
  size assertion to `validateImportFile` in `attendance.service.ts`; stream the
  CSV parse rather than `buffer.toString('utf8')`.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### FILE-06 — The declared content type is trusted; no upload path sniffs content, and the MIME and extension checks are independent

- **Category:** Input Validation
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** all upload paths
- **Evidence:**

  Every validator compares `file.mimetype` — the client's own multipart
  `Content-Type` header — against an allowlist:
  ```
  services/api/src/modules/documents/documents.service.ts:731-734
    if (!allowedMimeTypes.has(file.mimetype.toLowerCase())) {
      throw new BadRequestException('Uploaded file type is not supported.');
    }
  services/api/src/modules/employees/employee-profiles.service.ts:2054
    if (!allowedMimeTypes.has(file.mimetype)) {
  services/api/src/modules/tenant-settings/branding-assets.service.ts:141
    if (!policy.allowedMimeTypes.includes(mimeType)) {
  ```
  The extension check is a separate test against the *filename*, so the two can
  legitimately disagree:
  ```
  services/api/src/modules/documents/documents.service.ts:736-756
    const normalizedExtension = normalizeFileExtension(file.originalname);
    ...
    if (allowedExtensions.size > 0 && !allowedExtensions.has(extension.toLowerCase()))
  ```
  Default tenant policy: `allowedExtensions: 'pdf,doc,docx,png,jpg,jpeg'`,
  `blockedExtensions: 'exe,bat,cmd,js,sh'`, `allowedMimeTypes: ''`
  (`tenant-settings.catalog.ts:527-530`) — with `allowedMimeTypes` empty the
  fallback list is used, and it contains SVG:
  ```
  services/api/src/modules/documents/documents.service.ts:41-50
    const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
      'application/pdf', ..., 'image/svg+xml', 'image/x-icon', ...]);
  ```
  No magic-byte or content sniffing exists: a search for `file-type`,
  `fileTypeFrom`, magic-number checks or `%PDF` over the upload paths returns
  only PDF *writers* and one incidental `bytes[0] === 0x89` in
  `contracts.service.ts:4272`.

- **Current behaviour:** `logo.png` with a declared type of `image/svg+xml`
  satisfies both checks, is stored as SVG, and is later served as SVG. The
  converse also holds: a real executable named `report.pdf` and declared
  `application/pdf` is accepted and stored.
- **Expected behaviour:** Sniff the leading bytes, require the sniffed type to be
  in the allowlist, and require it to agree with the extension. Never persist the
  client's declared type as the type the download path replays.
- **Risk:** It is the enabling half of FILE-02, and it makes the tenant's
  extension allowlist unenforceable in either direction.
- **Remediation:** Add a shared `sniffContentType(buffer)` in
  `common/storage/`, call it from every validator, and store the sniffed type
  rather than `file.mimetype`.
- **Difficulty:** MEDIUM
- **Regression risk:** MEDIUM — existing rows carry declared types
- **Fix now:** YES

---

### FILE-07 — `GET /payslips/:id/download` applies no row-level scope

- **Category:** AuthZ (object-level)
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/payslips/payslips.service.ts`
- **Evidence:**
  ```
  services/api/src/modules/payslips/payslips.service.ts:728-739
    private async findPayslipOrThrow(tenantId: string, payslipId: string) {
      const payslip = await this.prisma.payslip.findFirst({
        where: { tenantId, id: payslipId },
        include: payslipInclude,
      });
  ```
  `grep -n "buildScopedAccessWhere\|resolveEffectiveAccessLevel" services/api/src/modules/payslips/payslips.service.ts`
  → no hits. The whole `payslips` module is absent from the list of modules that
  use `buildScopedAccessWhere`.

  The self-service route is correctly scoped, by contrast:
  ```
  services/api/src/modules/payslips/payslips.service.ts:715-724
    const payslip = await this.prisma.payslip.findFirst({
      where: { tenantId, id, employeeId: employee.id, status: PayslipStatus.PUBLISHED },
  ```
- **Current behaviour:** `/payslips/:id/download` requires `payslips.read-all` **and**
  `payslips.download` (`payslips.controller.ts:150`). The Employee role holds
  `payslips.read-own` + `payslips.download` but **not** `payslips.read-all`
  (`rbac-matrix.ts:1256-1259`), so an ordinary employee is correctly refused. But
  the HR role holds `payslips.read-all` at `RoleAccessLevel.ORGANIZATION`
  (`permissions.ts:2156-2162`, `2389-2390`) and the download path never consults
  that access level — it reads any payslip in the tenant.
- **Expected behaviour:** Apply `buildScopedAccessWhere(user, ENTITY_KEYS.PAYSLIPS…)`
  (or the employee-scoped equivalent) to `findPayslipOrThrow`, as
  `documents.service.ts:477-507` does for documents.
- **Risk:** An ORGANIZATION- or BUSINESS_UNIT-scoped HR user reads salary detail
  for employees outside their scope by changing the id. Intra-tenant, and
  privileged, so not a tenant break — but it is the exact class of leak the
  access-level model exists to prevent.
- **Remediation:** Add the scope predicate in `findPayslipOrThrow`, and extend
  `payslips.download.spec.ts` with a scoped-role case.
- **Difficulty:** LOW
- **Regression risk:** MEDIUM — a too-tight predicate would break HR payroll work
- **Fix now:** LATER

---

### FILE-08 — Deleting a document deletes nothing; the bytes stay on disk forever

- **Category:** Data Lifecycle / Privacy
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/documents/documents.service.ts`
- **Evidence:**
  ```
  services/api/src/modules/documents/documents.service.ts:410-431
    async archive(currentUser, documentId) {
      ...
      await this.documentsRepository.archiveDocument(currentUser.tenantId, documentId, currentUser.userId);
  ```
  `DELETE /documents/:documentId` maps to `archive`
  (`documents.controller.ts:220-227`). `StorageService.deleteFile` is called from
  only eight places — DLP retention, release publisher rollback, employee document
  replace/remove, report-artifact sweep, and tenant erasure — never from the
  documents module.

  The only retention sweep that exists is for report artifacts:
  ```
  services/api/src/modules/reporting/export/report-artifact.service.ts:331-362
    async sweepExpired(...)  ->  await this.storage.deleteFile(run.resultFileKey)
  ```
  and `schema.prisma:14322` records the gap in its own comment: "Artifacts are
  swept after this instant. DataJob.resultFileKey has no …".

- **Current behaviour:** Archived documents' bytes persist indefinitely with a
  live, resolvable `storageKey`. There is no retention policy, no versioning
  policy and no sweep for `Document`, `DocumentVersion`, `DocumentReference`,
  `EmployeeDocumentReference`, `DataJob` import/export files, contract documents
  or support-case attachments.
- **Expected behaviour:** A real delete (or a documented soft-delete window with a
  sweeper), so that "delete this passport scan" removes the passport scan.
- **Risk:** A tenant cannot honour a deletion request; storage grows without
  bound; and because FILE-03 lets a caller name a key directly, an "archived"
  document is still readable.
- **Remediation:** Add a `documents` retention sweeper mirroring
  `report-artifact.service.ts:sweepExpired`, and call `storage.deleteFile` from
  `archive` once a grace window elapses.
- **Difficulty:** MEDIUM
- **Regression risk:** MEDIUM — deletion is irreversible
- **Fix now:** LATER

---

### FILE-09 — Tenant erasure sweeps only two of the eight models that hold storage keys

- **Category:** Data Lifecycle / Privacy / Compliance
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW (ITEM-0003 records that tenant erasure has never been exercised against a database, which is adjacent)
- **Component:** `services/api/src/modules/tenant-control-plane/tenant-erasure.service.ts`
- **Evidence:**
  ```
  services/api/src/modules/tenant-control-plane/tenant-erasure.service.ts:658-672
    private async collectStorageKeys(tenantId: string) {
      const [documents, versions] = await Promise.all([
        this.prisma.document.findMany({ where: { tenantId }, select: { storageKey: true } }),
        this.prisma.documentVersion.findMany({ where: { tenantId }, select: { storageKey: true } }),
      ]);
      return [...documents.map(i => i.storageKey), ...versions.map(i => i.storageKey)]
        .filter((key): key is string => Boolean(key));
    }
  ```
  Models carrying a `storageKey` that this does **not** collect, all with a
  `tenantId` column (`schema.prisma`): `EmployeeDocumentReference` (5466),
  `DocumentReference` (7194 — candidate CVs), `ScreenCaptureEvent` (10926 — DLP
  screenshots of employee screens), `SupportCaseAttachment` (3757),
  `ContractDocument` (3214), plus `DataJob.resultFileKey` (11379) and
  `ReportRun.resultFileKey` (14318).
- **Current behaviour:** After an erasure run reports success, candidate CVs,
  employee document references, DLP screenshots, data-import source files and
  export artifacts remain on disk under the erased tenant's prefix.
- **Expected behaviour:** `collectStorageKeys` should enumerate every model with a
  storage key, and a test should fail when a new one is added without being
  registered — mirroring the existing `TENANT_ERASURE_DELETE_ORDER` discipline.
- **Risk:** An erasure certificate that is not true. For a customer exercising a
  right to erasure, the most sensitive artefacts (screen captures, identity
  documents, CVs) are precisely the ones left behind.
- **Remediation:** Extend `collectStorageKeys`; add a spec that reflects over the
  Prisma DMMF for `storageKey`/`resultFileKey` fields on tenant-owned models and
  asserts each is covered.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### FILE-10 — Every file download through a Next proxy is buffered whole into the frontend's heap

- **Category:** Performance / Availability
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `apps/web/lib/server-api.ts`, `apps/admin/lib/server-api.ts`, 36 route handlers
- **Evidence:**
  ```
  apps/web/lib/server-api.ts:480-483
    export async function proxyApiFileResponse(response: Response): Promise<NextResponse> {
      const body = await response.arrayBuffer();
  apps/admin/lib/server-api.ts:205-206
    export async function proxyApiFileResponse(response: Response) {
      const body = await response.arrayBuffer();
  ```
  36 route files call it, including `apps/web/app/api/app-releases/[...path]/route.ts`
  — the desktop-agent installer path, whose artefacts are capped at 512 MB
  (`render.yaml:149-150`, `RELEASE_ARTIFACT_MAX_BYTES` default 512 MB).

  The upload direction is the same:
  ```
  apps/web/app/api/documents/upload/route.ts:6-9
    const response = await apiRequest("/documents/upload", {
      method: "POST", body: await request.formData() });
  ```

- **Current behaviour:** The API side is correct — it streams
  (`StorageService.openFile` returns a `createReadStream`, and controllers return
  `StreamableFile`). The frontend proxies then undo that: each download allocates
  the entire file in the Next.js process before writing a byte, and each upload
  allocates the entire multipart body. Downloads are also proxied through two
  hops (storage → API → Next → browser), so all download bandwidth and event-loop
  time is paid twice.
- **Expected behaviour:** Return `new NextResponse(response.body, …)` and pass the
  upstream `ReadableStream` through; forward the request body as a stream on
  upload.
- **Risk:** A handful of concurrent installer downloads exhausts the web app's
  heap. On smaller files it is a steady, unnecessary memory and latency cost on
  every document view in the product.
- **Remediation:** Change both `proxyApiFileResponse` implementations to forward
  `response.body`; the existing comment about `Content-Length` (lines 492-498)
  stops applying once the body is streamed rather than decoded.
- **Difficulty:** LOW
- **Regression risk:** MEDIUM — `apps/web/app/api/proxy-response-headers.spec.ts`
  pins current behaviour and would need updating
- **Fix now:** LATER

---

### FILE-11 — `disableExternalDownloads` is enforced on `/download` and bypassed by `/view`

- **Category:** AuthZ / Product Integrity
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/documents/documents.service.ts`
- **Evidence:**
  ```
  services/api/src/modules/documents/documents.service.ts:464-474
    async openForDownload(currentUser, documentId) {
      const documentSettings = await this.tenantSettingsResolverService.getDocumentSettings(currentUser.tenantId);
      if (documentSettings.disableExternalDownloads) {
        throw new BadRequestException('Document downloads are disabled by tenant document settings.');
      }
      return this.openForView(currentUser, documentId);
    }
  ```
  `openForView` (line 446) has no such check, and `GET /documents/:documentId/view`
  (`documents.controller.ts:158-180`) returns the identical bytes — only the
  `Content-Disposition` differs (`inline` vs `attachment`). The employee-document
  routes (`employees.controller.ts:626` and `:653`) apply neither.
- **Current behaviour:** A tenant that disables downloads still serves every
  document over the `/view` route; the browser's "Save as" completes the download.
- **Expected behaviour:** Enforce the setting in `openForView`, or drop the
  setting and disposition it `NOT_IMPLEMENTED`.
- **Risk:** A tenant believes a DLP control is in force when it is not.
- **Remediation:** Move the check into `openForView`; add the same check to
  `employee-profiles.service.ts:downloadEmployeeDocument`.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

### FILE-12 — Data-management export artifacts are tenant-scoped but not user-scoped

- **Category:** AuthZ (object-level)
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/data-management/export-execution.service.ts`
- **Evidence:**
  ```
  services/api/src/modules/data-management/export-execution.service.ts:327-337
    async openExportFile(currentUser: AuthenticatedUser, jobId: string) {
      const job = await this.prisma.dataJob.findFirst({
        where: { id: jobId, tenantId: currentUser.tenantId, kind: 'EXPORT' },
        select: { resultFileKey: true, fileName: true, status: true },
      });
  ```
  No `createdById` filter. The export *generation* path does apply row scope —
  `export-execution.service.ts` is one of the modules that imports
  `buildScopedAccessWhere` — so the artefact's contents reflect the *producing*
  user's scope, not the downloader's.
- **Current behaviour:** Any user in the tenant holding the export permission can
  download any other user's completed export by job id, including one generated at
  a wider row scope.
- **Expected behaviour:** Filter on `createdById`, or re-apply the caller's scope
  when serving.
- **Risk:** A BUSINESS_UNIT-scoped user downloads a tenant-wide employee export
  produced by an admin. `DataJob.resultFileKey` also has no expiry
  (`schema.prisma:14322`), so the window is permanent.
- **Remediation:** Add `createdById: currentUser.userId` (or an explicit
  share model) to the `findFirst` in `openExportFile`, and to `getExportSummary`.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

### FILE-13 — There is no backup of the file store at all

- **Category:** Data Loss / Operations
- **Severity:** MEDIUM (CRITICAL in combination with FILE-01)
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** deployment
- **Evidence:** No disk exists on the live service (FILE-01), so there is nothing
  to snapshot. `render.yaml` declares no backup or snapshot policy, no repository
  script references a file-store backup (`scripts/` has none), and no document
  under `docs/deployment/` or `docs/architecture/` mentions backing up files as
  distinct from the database — a search for backup/restore terms co-occurring with
  file/disk/storage across those trees returns one unrelated hit.
- **Current behaviour:** The database is on Neon (which has instant restore and
  branching); the files are on nothing.
- **Expected behaviour:** Whatever holds the bytes must have a documented backup
  and a documented restore drill, and the restore must be consistent with a
  database point-in-time restore — otherwise a database rollback resurrects rows
  pointing at keys that no longer exist, or vice versa.
- **Risk:** No recovery path for lost documents, and no way to answer "restore the
  contract we deleted last Tuesday."
- **Remediation:** Move to object storage with versioning and lifecycle rules
  (this also resolves FILE-01 and the single-instance pin), then document the
  restore procedure alongside the Neon one.
- **Difficulty:** MEDIUM
- **Regression risk:** LOW
- **Fix now:** YES (as part of FILE-01)

---

### FILE-14 — Invoice PDFs use a second storage root that is declared nowhere and set nowhere

- **Category:** Data Loss / Configuration
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/super-admin/super-admin.service.ts`
- **Evidence:**
  ```
  services/api/src/modules/super-admin/super-admin.service.ts:4209-4215
    private getInvoiceStorageRoot() {
      return path.resolve(
        this.configService.get<string>('INVOICE_STORAGE_DIR') ??
          process.env.INVOICE_STORAGE_DIR ??
          path.join(process.cwd(), 'storage', 'generated'),
      );
    }
  services/api/src/modules/super-admin/super-admin.service.ts:4179-4190
    const fileName = `${sanitizeFilePart(invoice.invoiceNumber)}.pdf`;
    const relativePath = path.join('invoices', invoice.id, fileName);
    ...
    await writeFile(absolutePath, buildProfessionalInvoicePdf(...));
  ```
  `grep -rn "INVOICE_STORAGE_DIR" render.yaml docs/environment-variables.md` →
  no hits. It is absent from the live service's 86 environment variables.
- **Current behaviour:** Invoice PDFs are written outside `StorageService`, to
  `services/api/storage/generated/invoices/<id>/<number>.pdf` on the ephemeral
  filesystem. They are regenerated on demand (`ensureInvoicePdf`), so the loss is
  recoverable — but the `Invoice.pdfStorageKey` column and its
  `generatedAt`/`generatedByUserId` provenance become false after any deploy.
  Note that this is the one storage path with a **predictable, non-random key**;
  everything under `StorageService` embeds `randomUUID()`.
- **Expected behaviour:** Route invoice PDFs through `StorageService` so there is
  one storage root, one path-sanitisation function and one backup story.
- **Risk:** Configuration drift and a second, weaker code path — `sanitizeFilePart`
  (`super-admin.service.ts:5319-5321`) permits `.` and therefore `..`, which is
  only safe because `invoiceNumber` is server-generated.
- **Remediation:** Replace `ensureInvoicePdf`'s direct `mkdir`/`writeFile` with
  `storageService.saveFile({ subdirectory: 'invoices/<tenantId>' })`.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

### FILE-15 — The on-disk layout is only sometimes tenant-prefixed

- **Category:** Tenant Isolation (defence in depth)
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** all `saveFile` call sites
- **Evidence:** Every `subdirectory` argument in the codebase:
  ```
  documents.service.ts:273            `${currentUser.tenantId}/documents/${entityType}/${entityId}`
  employee-profiles.service.ts:1170   `${currentUser.tenantId}/employees/${employeeId}/documents`
  employee-profiles.service.ts:1439   `${currentUser.tenantId}/employees/${employeeId}/profile-image`
  payroll-output-document.service.ts:30 `${params.tenantId}/documents/${entityType}/${entityId}`
  dlp.service.ts:187                  `${DLP_SCREENSHOT_PREFIX}/${user.tenantId}`
  export-execution.service.ts:271     `data-exports/${currentUser.tenantId}`
  import-analysis.service.ts:238      `data-imports/${currentUser.tenantId}`
  report-artifact.service.ts:181      `${STORAGE_ROOT_SUBDIRECTORY}/${tenantId}`
  contracts.service.ts:1741,3722,4011,4358  `contracts/${contractId}/...`      <- no tenant
  support-cases.service.ts:485        `support-cases/${id}/attachments`        <- no tenant
  release-publisher.service.ts:681    `${RELEASE_STORAGE_PREFIX}/${appKey}/${version}`  (platform-wide, correct)
  ```
  The key builder itself is sound — `sanitizePathSegment` maps `.` to `-`, so
  `..` becomes `--` and a subdirectory cannot traverse, and `resolveStoragePath`
  strips leading parent segments after `normalize`
  (`storage.service.ts:87-103`).
- **Current behaviour:** Contract documents and support-case attachments — both
  tenant-owned data (`ContractDocument`, `SupportCaseAttachment.tenantId`) — sit in
  a flat namespace with no tenant partition. There is no tenant prefix to
  enforce, so the FILE-03 remediation cannot be applied uniformly.
- **Expected behaviour:** One key-construction helper,
  `tenantStorageKey(tenantId, ...parts)`, used everywhere, so the prefix is
  structural rather than per-call-site.
- **Risk:** Low on its own; it removes the last structural barrier behind FILE-03,
  and it makes a per-tenant export or migration of the file store impossible for
  those two areas.
- **Remediation:** Introduce the helper and re-prefix the two areas behind a
  backfill.
- **Difficulty:** MEDIUM (existing keys must be migrated or dual-read)
- **Regression risk:** MEDIUM
- **Fix now:** NO

---

### FILE-16 — The stored filename is interpolated into `Content-Disposition` unescaped on eight download routes

- **Category:** Input Validation
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `documents`, `employees`, `payslips`, `recruitment`, `tenants` controllers
- **Evidence:**
  ```
  services/api/src/modules/documents/documents.controller.ts:174-177
    response.setHeader('Content-Disposition', `inline; filename="${document.originalFileName}"`);
  services/api/src/modules/employees/employees.controller.ts:670
    `inline; filename="${document.originalFileName}"`
  services/api/src/modules/payslips/payslips.controller.ts:163-166
    `attachment; filename="${file.fileName}"`
  services/api/src/modules/tenants/public-tenants.controller.ts:58-61
    `inline; filename="${asset.document.originalFileName}"`
  ```
  The raw `originalname` is what is persisted — `StorageService.sanitizeFileName`
  (`storage.service.ts:96-99`) sanitises only the *storage key*, not the
  `originalFileName` column (`documents.service.ts:283`).

  One route does it correctly, which shows the pattern is known:
  ```
  services/api/src/modules/data-management/data-management.controller.ts:184-187
    `attachment; filename="${file.filename.replace(/["\\]/g, '')}"`
  ```
- **Current behaviour:** A filename containing `"` truncates the header and lets
  the uploader control the apparent download name; CR/LF is rejected by Node's own
  header validation (so this is header *spoofing*, not response splitting) and
  produces a 500 rather than an injection.
- **Expected behaviour:** RFC 6266 encoding — a sanitised `filename=` plus
  `filename*=UTF-8''…`.
- **Risk:** A victim is shown a benign-looking filename for content the uploader
  chose; a 500 on any document whose name contains a newline.
- **Remediation:** One shared `contentDispositionHeader(disposition, fileName)`
  helper in `common/utils/`, used by all eight sites.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

### FILE-17 — A candidate document's `storageKey` may be an absolute URL, producing an authenticated open redirect

- **Category:** AuthZ / Phishing
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/recruitment/*`
- **Evidence:**
  ```
  services/api/src/modules/recruitment/recruitment.service.ts:1001-1007
    if (isAbsoluteHttpUrl(document.storageKey)) {
      return { document, redirectUrl: document.storageKey, file: null };
    }
  services/api/src/modules/recruitment/recruitment.service.ts:2791-2793
    function isAbsoluteHttpUrl(value: string) {
      return /^https?:\/\//i.test(value);
    }
  services/api/src/modules/recruitment/candidates.controller.ts:205-208
    if (redirectUrl) { response.redirect(redirectUrl); return; }
  ```
  There is no host allowlist.
- **Current behaviour:** Any user who can register a candidate document sets
  `storageKey: "https://evil.example/"`; a colleague clicking "View CV" is
  302-redirected off-platform from a trusted product URL.
- **Expected behaviour:** An allowlist of external document hosts, or a separate
  `externalUrl` column with its own validation, as `ApplicationRelease` already
  models (`externalUrl` vs `storageKey`).
- **Risk:** Internal phishing with a product-origin referrer.
- **Remediation:** Split the column, validate the host, and refuse a redirect to
  anything not allowlisted.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

### FILE-18 — `storageKey` is returned to browsers and written into audit snapshots

- **Category:** Information Exposure
- **Severity:** INFORMATIONAL (the multiplier on FILE-03)
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/documents/documents.service.ts`
- **Evidence:**
  ```
  services/api/src/modules/documents/documents.service.ts:978        storageKey: document.storageKey,   // inside mapDocument()
  services/api/src/modules/documents/documents.service.ts:433-441    beforeSnapshot: this.mapDocument(document)   // DOCUMENT_ARCHIVED audit row
  services/api/src/modules/documents/documents.service.ts:326-332    afterSnapshot: this.mapDocument(created)     // DOCUMENT_UPLOADED audit row
  ```
  Contrast with the DLP module, which is explicit that the key must not escape:
  ```
  services/api/src/modules/agent/dlp/dlp.service.ts:402-404
    * (controller) streams them; the storage key never reaches the client.
  ```
- **Current behaviour:** Every `GET /documents`, `GET /documents/:id`,
  `POST /documents/upload` and entity-document listing hands the caller the raw
  storage key, and every document audit row persists it.
- **Expected behaviour:** Treat the key as server-internal, as `dlp` already does.
- **Risk:** Turns FILE-03 from "needs a leaked key" into "needs a key you were
  already given".
- **Remediation:** Remove `storageKey` from `mapDocument`; snapshot a redacted
  projection in the audit calls.
- **Difficulty:** LOW
- **Regression risk:** MEDIUM — the recruitment CV flow currently depends on it
  (fix with FILE-03)
- **Fix now:** YES (with FILE-03)

---

### FILE-19 — multer 2.2.0 carries three high DoS advisories on every upload endpoint

- **Category:** Dependency / Availability
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** KNOWN (ITEM-0123, `Status: DEFERRED`, accepted risk with a removal trigger)
- **Component:** `services/api` dependency tree
- **Evidence:** `docs/backlog/items/ITEM-0123-multer-carries-three-high-advisories-and-the-override-that-f.md` —
  GHSA-wc9g-mqfw-jrwm, GHSA-qfvm-cv95-jqjf, GHSA-535w-7cp7-47q4;
  `@nestjs/platform-express` pins multer at exactly `2.2.0` and no published
  version bumps it. Dispositioned in `scripts/check-production-advisories.mjs`
  with a one-line removal trigger.
- **Current behaviour:** Accepted risk, argued and recorded.
- **Expected behaviour:** As recorded.
- **Risk:** Compounds FILE-05 — the parser itself is a DoS vector *and* the
  endpoints it serves have no size ceiling. Fixing FILE-05 reduces the exposure
  of this one materially, which is worth saying in the disposition.
- **Remediation:** No new action; note the interaction with FILE-05 on the item.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** NO — already dispositioned

---

### FILE-20 — What breaks on a second instance

- **Category:** Scalability
- **Severity:** INFORMATIONAL
- **Confidence:** CONFIRMED
- **Known:** NEW (`render.yaml:48-51` states the tradeoff for the disk that is not actually attached)
- **Component:** deployment architecture
- **Evidence:** `numInstances: 1` on the live service; `render.yaml:48-51` —
  "a Render disk pins this service to a SINGLE INSTANCE — it cannot be attached to
  a horizontally scaled service … if the API ever needs to scale out, file storage
  must move to object storage (S3/R2)".
- **Current behaviour:** With today's configuration (no disk), a second instance
  would write uploads to its own local filesystem and serve 404 for anything the
  first instance stored — a ~50% failure rate on document reads that looks like
  intermittent corruption. With the declared disk attached, scale-out is refused
  by Render outright.
- **Expected behaviour:** Storage that any instance can reach.
- **Risk:** Horizontal scaling is blocked, and attempting it produces
  non-deterministic 404s rather than a clean failure.
- **Remediation:** Object storage (this is the same remediation as FILE-01 and
  FILE-13).
- **Difficulty:** MEDIUM
- **Regression risk:** LOW
- **Fix now:** LATER

---

## The two questions, answered plainly

**Can tenant A download tenant B's files?**

**Yes, in one case by design and unauthenticated, and conditionally in two more.**

1. **Branding assets: yes, and no login is needed.**
   `GET /api/public/tenants/<any-slug>/assets/{logo|favicon|login-image}` is
   `@Public()` (`public-tenants.controller.ts:34-35`) and takes the tenant slug
   from the path with no check against the requesting host — through either the
   API directly or any tenant's web-app proxy
   (`apps/web/app/api/public/tenants/[tenantSlug]/assets/[assetType]/route.ts:28-31`).
   Logos are low-sensitivity, but they are tenant-uploaded files served to the
   whole internet from every tenant's origin, and via FILE-02 they are an
   executable-content channel into other tenants' origins.

2. **Everything else: not by changing an id.** Every other download reads the
   owning row with an explicit `tenantId` filter before it touches
   `StorageService` — I traced all fourteen `openFile` call sites (see Healthy
   below). There is no id-substitution cross-tenant read.

3. **But the file store has no tenant boundary of its own, and two endpoints let
   a caller name a key directly.** `POST /candidates/:id/documents` and
   `POST /app-releases` both accept `storageKey` from the request body and read it
   back with no tenant-prefix validation (FILE-03). Keys are random UUIDs and
   cannot be guessed — but they are returned to browsers in every document
   response and written into audit rows (FILE-18), so any key that has ever left
   the server is a working cross-tenant read capability that does not expire, and
   that still resolves after the document is "deleted" (FILE-08).

**Can employee A download employee B's payslip?**

**No.** Both payslip download routes hold.
- `GET /me/payslips/:id/download` filters on the caller's own `employeeId` and on
  `PayslipStatus.PUBLISHED` (`payslips.service.ts:715-724`).
- `GET /payslips/:id/download` requires **both** `payslips.read-all` and
  `payslips.download` (`payslips.controller.ts:150`), and the Employee role holds
  only `payslips.read-own` + `payslips.download` (`rbac-matrix.ts:1256-1259`), so
  the guard refuses it.

The residual defect is one level up: a user who *does* hold `payslips.read-all` —
HR, whose role access level is ORGANIZATION — reaches every payslip in the tenant,
because the download path applies no row-level scope at all (FILE-07). That is a
privileged intra-tenant over-reach, not an employee-to-employee break.

---

## Healthy — verified good

- **Path traversal is properly defended in `StorageService`.**
  `resolveStoragePath` normalises then strips leading parent segments
  (`storage.service.ts:87-93`), `sanitizeFileName` reduces to `basename` and
  `[a-zA-Z0-9._-]` (`:96-99`), and `sanitizePathSegment` maps `.` to `-` so a
  subdirectory literally cannot contain `..` (`:101-103`). I could not construct a
  key that escapes the storage root.
- **Every one of the fourteen `openFile` call sites reads its row under an
  explicit tenant or platform guard first.** Tenant-scoped: `documents.service.ts:446-460`,
  `employee-profiles.service.ts:1363-1372` (and `:1518`), `payslips.service.ts:729-731`,
  `export-execution.service.ts:328-331`, `report-artifact.service.ts:263`
  (`requireRun(tenantId, runId)`), `dlp.service.ts:406-408`,
  `recruitment.service.ts:987-990`, `public-tenants.service.ts:181-193`.
  Platform-guarded: `contracts.service.ts:4400-4402` and
  `support-cases.service.ts:512-514`, both preceded by `this.assertPlatform(user)`.
  Global by design: `app-release.service.ts:213-215`.
- **Employee document access is genuinely object-level authorized**, including a
  SELF mode that narrows to documents the caller uploaded:
  `employee-profiles.service.ts:1358-1372`.
- **Document access applies row scope and fails closed.**
  `assertDocumentAccess` (`documents.service.ts:521-563`) walks the document's
  entity links, resolves the owning employee, tests it against
  `buildScopedAccessWhere`, and throws `NotFoundException` if no link is visible —
  a document with no resolvable link is denied, not allowed.
- **The self-service payslip route is correctly narrowed** to the caller's own
  employee record *and* to published payslips only (`payslips.service.ts:715-724`).
- **Platform log-file download is exemplary path handling** — decode, reject
  anything that is not a bare basename, reject `..`, pattern-match the filename,
  re-resolve and assert containment (`platform-monitoring.service.ts:536-556`),
  behind `assertSuperAdmin` and an audit call.
- **Report export artifacts have a real retention sweep** that deletes the bytes
  and nulls the key so nothing later believes they exist
  (`report-artifact.service.ts:331-362`), driven by `REPORTS_ARTIFACT_RETENTION_DAYS`
  which *is* set on the live service.
- **DLP screenshots are encrypted at rest and the key never reaches the client**
  (`dlp.service.ts:402-404`, `:426-436`), and viewing one is audited.
- **The API streams rather than buffers on the download path** — `openFile`
  returns `createReadStream` and controllers return `StreamableFile`. The
  buffering problem (FILE-10) is entirely in the Next.js proxies.
- **Branding upload orchestration compensates on failure** rather than orphaning
  the document (`branding-assets.service.ts:180-200`), and the policy was
  deliberately moved from the web proxy to the API (BUG-0041 / ITEM-0050).
- **Data-management import validation is the best of the upload validators** —
  25 MB cap, sheet cap, row cap, extension *and* MIME both required
  (`import-analysis.service.ts:41-43`, `:355-365`) — and it is the only download
  route that escapes the filename in `Content-Disposition`
  (`data-management.controller.ts:186`).
- **`@repo/config` security headers set `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY` and HSTS on all three Next apps**
  (`packages/config/security-headers.js:25-76`). They do not stop the SVG issue —
  SVG is served under its correct type — but they are correctly in place.
- **No database BLOB storage and no base64-in-column storage anywhere.** Searched
  `schema.prisma` for `Bytes` (only `*SizeBytes` integers) and for
  data/content/blob/base64 columns; the only inline-bytes candidate,
  `ScreenCaptureEvent`, carries a comment saying the bytes deliberately live in
  `StorageService` and never inline (`schema.prisma:10933-10934`).

## Not examined / limits

- **I did not execute any exploit.** Every finding is read end-to-end from source,
  plus three read-only production probes: the Render service/disk/env-var API
  (which is what makes FILE-01 CONFIRMED rather than LIKELY) and one
  unauthenticated `GET` against `/api/public/tenants/<slug>/assets/logo` to
  confirm the route is live and unauthenticated. I did **not** upload an SVG, did
  not craft a `storageKey`, and did not authenticate to production.
- **I did not verify the production `AUTH_COOKIE_DOMAIN` value**, only that the
  key is set on the service. FILE-02's blast radius (whether an XSS on one tenant
  subdomain reaches cookies scoped to the parent domain) depends on it. The
  same-origin proxy attack described in FILE-02 does not depend on it and holds
  either way.
- **I did not trace the `agent-desktop` or `.NET gateway` sides** of file
  handling — the desktop agent's DLP capture upload was examined only at the API
  boundary (`agent/dlp`), and the gateway's own file handling, if any, was not
  looked at.
- **`apps/admin` upload/download routes were sampled, not enumerated.** I
  confirmed `apps/admin/lib/server-api.ts` shares the buffering proxy and that
  `apps/admin/app/api/contracts/[[...path]]/route.ts` uses it; I did not audit
  admin-side authorization on those routes.
- **I did not run any test suite** (the briefing forbids installs/builds and the
  findings did not require one). `payslips.download.spec.ts`,
  `branding-assets.service.spec.ts`, `app-release.service.spec.ts` and
  `release-publisher.service.spec.ts` exist and were not executed.
- **Contracts and support-cases attachment handling was checked only for tenant
  isolation on the read path** (both are `assertPlatform`-guarded). Their upload
  validation, retention and object-level authorization within the platform
  persona were not audited in depth — they belong as much to the commercial-domain
  specialist.

## For other specialists

- **AuthZ / RBAC:** `employees.controller.ts:580-712` gates employee document
  upload, download, view and delete with `@Permissions('dashboard.view')` — a
  permission every role holds. The real gate is the matrix privilege plus the
  service-level scope checks, which do hold, but the legacy decorator is
  meaningless there and reads as protection it does not provide.
- **AuthZ / RBAC:** the `payslips` module uses `buildScopedAccessWhere` nowhere at
  all — FILE-07 is the download instance, but `getPayslips` (the list) has the
  same gap.
- **Dependencies / CI:** ITEM-0123's disposition argues multer's DoS is "reachable
  and unavoidable". FILE-05 shows the exposure is much larger than it needs to be,
  because nine of thirteen upload endpoints also have no size ceiling of their own.
- **Deployment / configuration:** the live Render service carries **86**
  environment variables, and `render.yaml` is still not synced to it — the
  BUG-0767 condition persists. `FILE_STORAGE_DIR`, `INVOICE_STORAGE_DIR`,
  `PLATFORM_ENVIRONMENT`, `TRUST_PROXY_HEADERS`, `SEAT_OVERAGE_*`,
  `TENANT_RETENTION_DAYS`, `PLATFORM_OPS_NOTIFICATION_EMAILS` and every `EMAIL_*`
  key declared in `render.yaml` are absent from the service; `plan` is `standard`
  (the file says `starter`) and the build/start commands differ from the file's.
- **API surface:** `GET /api/public/tenants/resolve` and
  `/api/public/tenants/:slug/assets/:type` distinguish an existing tenant slug
  (200/404-with-no-asset) from a non-existent one, unauthenticated — tenant
  enumeration on a public endpoint.
