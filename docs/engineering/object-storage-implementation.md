Yes. At this point I would stop giving the agent fragmented instructions. Give it one authoritative implementation task and let the orchestrator discover the existing implementation, delegate work, implement it, test it, independently review it, and document the result.

One adjustment from the earlier prompts: I would not prescribe every class name, database field, or upload mechanism as mandatory. The agent has now audited the actual codebase, so it should have enough freedom to reuse existing architecture rather than creating duplicate abstractions. The prompt should define the outcome and non-negotiable security constraints while allowing implementation decisions based on what already exists.

Use the following as the complete prompt.

````md
# DijiPeople — Production Durable File Storage / Cloudflare R2 Full Implementation

## Mission

Implement the complete production-grade durable file/object-storage architecture for DijiPeople using Cloudflare R2.

This work remediates the confirmed P0 storage findings from the DijiPeople Full Technical Health Audit dated 2026-09-10.

This is NOT simply:

> Replace local filesystem writes with Cloudflare R2.

This task is:

> Discover every persistent file flow across DijiPeople, establish one secure and provider-independent storage architecture, migrate all appropriate persistent storage to Cloudflare R2, preserve tenant isolation and authorization, eliminate dependency on Render's ephemeral filesystem, test the complete implementation, independently security-review it, validate runtime persistence, and document the final architecture.

The implementation must be production-ready and reusable by current and future DijiPeople modules.

Do not stop after adding an SDK, creating a storage service, or making one upload endpoint work.

Complete the implementation end to end.

---

# 1. Authoritative Context

Read these documents before changing code:

`docs/engineering/audits/2026-09-10-full-technical-audit/00-EXECUTIVE-AUDIT-REPORT.md`

and all storage/security-related evidence under:

`docs/engineering/audits/2026-09-10-full-technical-audit/raw/`

Pay particular attention to findings related to:

- FILE-01
- INF-05
- upload memory exhaustion / missing limits
- tenant isolation
- authorization
- document access auditing
- rate limiting
- resilience
- local filesystem dependencies
- persistent files
- deployment/restart behavior

Do not blindly trust the audit.

Verify findings against the current code before changing anything.

The repository/schema/application behavior remain the primary sources of truth.

---

# 2. Production Infrastructure Already Configured

A private Cloudflare R2 production bucket has already been created:

`dijipeople-prod-files`

The following environment variables have already been configured securely on the Render API service:

```env
STORAGE_PROVIDER=r2
R2_BUCKET_NAME=dijipeople-prod-files
R2_ACCOUNT_ID=<configured securely>
R2_ACCESS_KEY_ID=<configured securely>
R2_SECRET_ACCESS_KEY=<configured securely>
R2_ENDPOINT=<configured securely>
R2_REGION=auto
````

The R2 API token is scoped to the production bucket.

The bucket has Public Access DISABLED.

These secrets must never be:

* printed
* logged
* committed
* copied into documentation
* copied into audit evidence
* placed into frontend environment variables
* exposed through an API
* included in screenshots
* included in tests
* included in error responses
* included in agent output

Never request the actual credential values.

Use runtime environment configuration.

---

# 3. Primary Acceptance Criteria

At the end of this task all of the following must be true.

Persistent DijiPeople business files must no longer depend on Render's ephemeral filesystem.

Persistent files must survive:

* application restart
* Render restart
* redeployment
* replacement of the running API instance

Production file storage must use the private Cloudflare R2 bucket.

All storage access must preserve:

* authentication
* authorization
* tenant isolation
* row/entity-level security
* appropriate auditability

Tenant A must never be capable of reading, downloading, overwriting, replacing, or deleting Tenant B's files.

R2 credentials must never reach browser/client code.

Business modules must not become directly coupled to Cloudflare.

The application must have a reusable storage abstraction.

Storage failure in production must fail safely.

Production must NEVER silently fall back to ephemeral local storage if R2 fails.

Persistent database metadata must remain authoritative for business authorization and document relationships.

Presigned URLs, if used, must be short-lived authorization artifacts and must never become permanent database URLs.

Large/user-uploaded files must have bounded memory behavior and explicit size limits.

Existing file functionality must continue working.

Tests must verify the implementation rather than merely testing mocks.

The original P0 condition must be reproduced before/where practical and proven resolved afterward.

---

# 4. Execution Model

Act as the lead/orchestrator.

Use specialist agents where they improve quality or speed.

You may create specialists for areas such as:

* repository/file-flow discovery
* storage architecture
* backend implementation
* frontend upload/download flows
* schema/migrations
* tenant-security review
* upload security
* testing
* infrastructure/runtime validation
* independent security review

Do not mechanically create agents for every topic.

Determine the most effective decomposition based on what actually exists.

Independent work may run in parallel.

Potentially conflicting implementation work must be coordinated through the orchestrator.

There must be ONE final storage architecture.

Do not allow individual modules to invent separate R2 clients or incompatible storage conventions.

---

# 5. Work on a Dedicated Branch

Do not implement this directly on production/main without isolation.

Create or use an appropriate implementation branch following repository conventions.

A suitable name would be:

`agent/r2-durable-storage`

or the equivalent project naming convention.

Do not mix unrelated refactoring, UI cleanup, formatting changes, dependency upgrades, or other audit remediation into this branch.

Keep the work scoped to storage and directly coupled issues required to make storage secure and reliable.

---

# 6. Discovery Comes Before Implementation

Before changing architecture, systematically discover every file interaction across the entire repository.

Search all applications, services, modules, packages, workers, scripts and jobs.

Identify usage including but not limited to:

* Node `fs`
* `fs/promises`
* `writeFile`
* `readFile`
* `unlink`
* `createWriteStream`
* local paths
* `/uploads`
* `/tmp`
* Multer
* memoryStorage
* diskStorage
* Buffer-based file handling
* Express static serving
* generated PDFs
* generated Excel files
* CSVs
* images
* signatures
* attachments
* report files
* contract generation
* document templates
* import files
* export files
* email attachments

Discover every business feature that handles files.

Examples may include, only where actually present:

* Employee Documents
* Identity documents
* Employee profile files
* Contracts
* Agreements
* Recruitment
* Candidate CVs/resumes
* Payroll
* Payslips
* Reports
* Tenant branding
* Logos
* Customer onboarding
* Partner onboarding
* HR documents
* Attendance imports
* Attendance exports
* Timesheet exports
* Generated documents
* Service-management attachments
* Email attachments
* Signatures

Do not assume this list is exhaustive.

Discover the actual implementation.

---

# 7. Produce a File Flow Inventory

Before implementation, create an internal working inventory for every discovered file flow.

Record:

* module
* controller/endpoint
* service
* frontend entry point
* current storage mechanism
* current database model
* current path/URL field
* persistent vs temporary
* tenant-owned vs platform/global
* authorization mechanism
* row-scope mechanism
* upload size limit
* MIME validation
* delete behavior
* download behavior
* whether migration is needed
* whether file currently survives redeployment

Classify each file as:

`PERSISTENT`

or

`TEMPORARY`

Persistent business files must move behind durable object storage.

Temporary processing artifacts may continue to use appropriate temporary filesystem storage when they genuinely exist only for the duration of processing.

Do not move temporary build/process artifacts into R2 merely because R2 exists.

---

# 8. Existing Architecture Must Be Reused Where Appropriate

Inspect the repository for an existing:

* storage service
* document service
* attachment abstraction
* file provider
* blob provider
* upload service
* provider interface
* document model
* file metadata model

If a suitable abstraction already exists, evolve it.

Do not create a parallel architecture unnecessarily.

The goal is one canonical storage architecture.

---

# 9. Provider-Independent Storage Architecture

Business modules must not directly instantiate or depend upon Cloudflare/S3 SDK clients.

Implement or adapt a shared storage abstraction.

Conceptually it should provide capabilities equivalent to:

```ts
interface ObjectStorageProvider {
  putObject(...): Promise<...>;
  getObject(...): Promise<...>;
  deleteObject(...): Promise<void>;
  objectExists(...): Promise<boolean>;

  getSignedDownloadUrl?(...): Promise<string>;

  getSignedUploadUrl?(...): Promise<...>;
}
```

This is conceptual, not a mandatory API.

Use naming and patterns consistent with the existing codebase.

The architecture should conceptually resemble:

```text
Business/domain modules
        │
        ▼
Document/File service
        │
        ▼
ObjectStorageProvider
        │
        ├── Cloudflare R2
        │
        └── Local/Test provider where justified
```

Cloudflare-specific implementation must remain inside its adapter/provider.

Future providers should be possible without rewriting document business logic.

Potential future implementations could include:

* AWS S3
* Azure Blob Storage
* regional/sovereign storage
* customer-owned storage

Do NOT implement those providers now.

Design for portability without overengineering.

---

# 10. Cloudflare R2 Implementation

Use Cloudflare R2's S3-compatible API.

Prefer the AWS SDK v3 unless a suitable compatible dependency already exists.

Likely dependencies include:

```text
@aws-sdk/client-s3
@aws-sdk/s3-request-presigner
```

Do not install duplicate libraries if equivalent capability already exists.

Configure the provider entirely through runtime configuration.

Validate configuration during startup.

When:

```text
STORAGE_PROVIDER=r2
```

required configuration must be valid.

Production must fail closed if required R2 configuration is unavailable.

Do NOT implement:

```text
R2 fails
→ write persistent file locally
→ report success
```

That would silently recreate the original P0 vulnerability.

---

# 11. Environment Configuration

Create or extend typed validated storage configuration.

Support the existing variables:

```env
STORAGE_PROVIDER=r2
R2_BUCKET_NAME=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ENDPOINT=
R2_REGION=auto
```

Update `.env.example` with empty/placeholders only.

Never place real values into source control.

Storage secrets must only be consumed server-side.

No storage credential may use:

```env
NEXT_PUBLIC_*
```

or any equivalent client-exposed mechanism.

---

# 12. Object Key Strategy

All R2 keys must be generated centrally.

Controllers and domain services should not manually concatenate storage paths throughout the application.

Tenant-owned objects should follow a deterministic logical hierarchy conceptually similar to:

```text
tenants/{tenantId}/{domain}/{entityId}/{documentId}/{objectId}
```

Examples:

```text
tenants/{tenantId}/employees/{employeeId}/documents/{documentId}/{objectId}.pdf
```

```text
tenants/{tenantId}/recruitment/{candidateId}/documents/{documentId}/{objectId}.pdf
```

```text
tenants/{tenantId}/contracts/{contractId}/documents/{documentId}/{objectId}.pdf
```

Use the actual domain structure discovered in DijiPeople.

Do not blindly copy these examples.

Do not construct storage keys from user-controlled names.

Do not put PII into storage keys.

Never put these in object keys:

* employee name
* email address
* phone
* national ID/CNIC
* passport number
* bank account
* IBAN
* tax ID
* salary
* arbitrary original filenames

Use opaque/generated identifiers.

Original filenames belong in authorized application metadata.

For truly global/platform assets, use a separate namespace such as:

```text
platform/...
```

Do not pretend global assets belong to arbitrary tenants.

---

# 13. Database Metadata

Inspect existing Prisma models before changing schema.

Reuse existing document/file models whenever practical.

Avoid creating a duplicate universal `File` model if existing domain models already properly represent files.

Persistent file metadata should be capable of representing the required information, conceptually including:

```text
id
tenant ownership where appropriate
related entity
original filename
MIME/content type
size
storage provider
storage key
checksum where justified
uploaded by
createdAt
updatedAt
document/file status
```

Do not store R2 credentials.

Do not store permanent public object URLs.

Do not persist signed URLs.

Signed URLs expire and are authorization artifacts.

Store durable object identity such as:

```text
storageProvider
storageKey
```

and resolve access at runtime.

---

# 14. Backward-Compatible Schema Evolution

If schema changes are necessary, use an expand → migrate/backfill → validate → contract strategy.

Do not immediately remove legacy fields if doing so would make rollback impossible.

If existing records contain local paths/URLs, preserve compatibility during migration.

Avoid one-way destructive migrations during initial rollout.

Any migration must be:

* idempotent where practical
* resumable
* observable
* batchable for production data
* safe to retry

---

# 15. Upload Authorization

Every upload must be authorized before storage access is granted.

Server-side checks must establish:

* authenticated identity
* tenant
* permission
* related entity
* row/entity scope
* business eligibility for uploading the document

Do not trust a browser-supplied `tenantId`.

Tenant context must come from authenticated server-side identity/authorization.

A client modifying:

```json
{
  "tenantId": "another-tenant"
}
```

must never cause an object to be stored in another tenant's namespace.

Use DijiPeople's existing authorization infrastructure.

Do not create a parallel storage-specific RBAC model.

---

# 16. Upload Validation

For every persistent upload path evaluate and enforce:

* allowed size
* allowed type
* MIME type
* extension where relevant
* empty-file handling
* malformed multipart payload
* safe filename handling
* duplicate behavior
* entity existence
* permission
* tenant scope

Do not blindly trust:

* `Content-Type`
* browser-provided extension
* original filename
* client metadata

Determine practical allowlists based on each business flow.

Avoid a single unnecessarily permissive "allow all file types" implementation.

---

# 17. Upload Size Limits

The technical audit found file-upload paths capable of buffering large files without sufficient controls.

This must be addressed as part of the storage remediation.

Every upload must have an explicit maximum size.

Use sensible limits per file category if the product has materially different requirements.

Do not allow unbounded request bodies.

Also configure appropriate request-level limits so rejected oversized requests cannot consume unlimited API memory first.

---

# 18. Upload Transport Strategy

Do not force one transport model onto every use case.

Determine the correct transport for each flow.

Two supported patterns are acceptable.

### Pattern A — API → R2

Best for:

* small files
* backend-generated files
* generated PDFs
* generated exports
* server-created artifacts

```text
Application
    ↓
DijiPeople API
    ↓
Object storage abstraction
    ↓
R2
```

### Pattern B — Authorized direct browser → R2

Prefer for sufficiently large user uploads when it materially reduces API memory/network load.

```text
Browser
   │
   │ request upload authorization
   ▼
DijiPeople API
   │
   ├── authenticate
   ├── authorize
   ├── create/allocate document
   └── issue short-lived signed upload
            │
            ▼
Browser ───────────► R2
            │
            ▼
        finalize
            │
            ▼
      DijiPeople API
```

Do not introduce direct uploads purely for architectural fashion.

Use them where they solve actual upload/memory/scaling problems.

Regardless of transport, the API remains the authority for business authorization.

---

# 19. Streaming and Memory Safety

Do not implement:

```text
entire 50MB file
→ Buffer
→ API RAM
→ R2
```

when streaming or direct upload is practical.

Avoid loading large objects completely into memory for upload/download unnecessarily.

Review Multer configuration.

Every file-handling endpoint must have bounded memory behavior.

---

# 20. Upload Lifecycle / Integrity

Prevent permanent database records pointing to failed/nonexistent uploads.

Also prevent uncontrolled R2 objects with no corresponding application metadata.

Where appropriate, use or reuse an upload lifecycle similar to:

```text
PENDING
    ↓
upload succeeds
    ↓
AVAILABLE
```

Failed flows may result in:

```text
FAILED
```

or cleanup.

Reuse an existing lifecycle if one exists.

Do not invent duplicate state machines.

Finalize direct uploads only after verifying the expected object exists and matches expected constraints.

Design retries to be idempotent.

---

# 21. Private Bucket Requirement

The production R2 bucket MUST remain private.

Do not enable Cloudflare R2 Public Access.

Do not make HR documents publicly addressable.

This includes:

* passports
* national IDs
* CNICs
* bank documents
* contracts
* employee documents
* CVs
* payslips
* salary documents
* HR attachments
* recruitment documents

Access must always originate from an authorized DijiPeople operation.

---

# 22. Download Authorization

The preferred flow is:

```text
GET /documents/{documentId}/download

            ↓

Authentication

            ↓

Resolve authenticated identity + tenant

            ↓

Load document metadata

            ↓

Verify tenant ownership

            ↓

Verify entity/row scope

            ↓

Verify permission

            ↓

Resolve storage object

            ↓

stream or return short-lived signed URL
```

Never authorize based solely on a `storageKey` supplied by the client.

Do not create a generic endpoint like:

```text
GET /storage?key=<arbitrary-key>
```

unless it has proven server-side ownership/authorization resolution.

Normal clients should work using domain/document identifiers.

---

# 23. Presigned Download URLs

Where appropriate, generate short-lived presigned GET URLs after DijiPeople authorization succeeds.

Use conservative expiry, generally measured in minutes rather than hours/days.

The exact expiration should fit UX requirements.

The signed URL must target one specific authorized object.

Do not create broad bucket-level access.

Do not store signed URLs in Neon.

Do not log signed URLs.

Do not expose R2 credentials while generating them.

---

# 24. Direct Upload Signed URLs

If direct-to-R2 uploads are implemented, the API must authorize BEFORE issuing upload capability.

Signed upload permissions should be:

* short-lived
* object-specific
* tenant-bound through the generated key
* size/type constrained where technically practical
* impossible to reuse for arbitrary paths

The browser must not choose an arbitrary R2 key.

The server generates the key.

After upload, DijiPeople should finalize/verify the document.

---

# 25. CORS for Direct R2 Uploads

If browser → R2 direct upload is implemented, configure only the CORS policy actually required.

Allow only approved DijiPeople origins.

Do not unnecessarily use:

```text
Access-Control-Allow-Origin: *
```

Allow only required methods and headers.

Verify preflight behavior.

Do not enable public object access.

CORS is not authorization.

Signed upload authorization is still required.

---

# 26. Download Filename Safety

The storage object key should use opaque identifiers.

The user's original filename may be preserved only as application metadata/presentation.

When sending:

```text
Content-Disposition
```

sanitize the filename.

Prevent response-header injection.

Do not trust arbitrary filenames.

---

# 27. File Deletion

Determine business semantics for every document category before changing delete behavior.

Distinguish:

* soft delete
* hard delete
* archive
* legally retained
* payroll/financial history
* contractual history

Do not automatically physically delete records/files where DijiPeople requires retention.

For physical deletion:

```text
authorize
→ resolve object
→ delete object
→ update metadata/state
→ audit
```

Handle partial failure.

If database metadata changes successfully but R2 deletion fails, do not silently lose track of the orphan.

Make the operation recoverable/retriable.

Cross-tenant delete attempts must fail.

---

# 28. Orphan Handling

Provide a safe way to identify:

```text
DB record exists
but R2 object is missing
```

and:

```text
R2 object exists
but DB metadata is missing
```

Do not automatically mass-delete orphan candidates merely because one scan claims they are orphaned.

Use a grace period and verification if automated cleanup is introduced.

A reporting/reconciliation tool is sufficient initially if safer.

---

# 29. Existing File Migration

Determine whether current persistent files actually exist.

Inspect:

* Render runtime filesystem if safely accessible
* database path references
* repository assets
* legacy upload locations
* other configured stores

Do not assume existing files exist.

Do not assume they are already lost.

For retrievable persistent files, migration should follow:

```text
locate source
→ verify source exists
→ upload to R2
→ verify R2 object
→ verify size/hash where applicable
→ update metadata reference
→ verify application download
→ mark migration successful
```

Do not delete source files until new storage is verified.

Migration must be:

* resumable
* idempotent
* batchable
* retry-safe
* observable

If records point to files that no longer exist because Render already discarded them, report them accurately.

Do not fabricate or silently replace missing documents.

Produce counts of:

* discovered records
* successfully migrated
* already R2
* source missing
* migration failed
* not applicable

Only report measured counts.

---

# 30. Checksum / Integrity

Evaluate SHA-256 content hashes for long-lived sensitive documents.

Where practical store:

```text
SHA-256
```

to support:

* migration verification
* corruption checks
* duplicate detection where useful
* evidence integrity

Do not use S3/R2 ETag as a universal checksum because multipart semantics differ.

Do not require loading an entire large file into RAM merely to hash it.

Hash using streaming when appropriate.

---

# 31. Object Metadata Privacy

Keep R2 object metadata minimal.

Do not duplicate business-sensitive information into R2 metadata.

Do not store:

* employee name
* email
* national ID
* bank details
* IBAN
* salary
* phone number
* sensitive HR information

Use opaque identifiers.

Business metadata belongs in Neon behind DijiPeople authorization.

---

# 32. Auditability

Review the existing audit framework.

Sensitive document operations should provide appropriate audit evidence.

At minimum determine coverage for:

* upload
* view/download
* replace
* delete

For sensitive files DijiPeople should be able to determine:

```text
Who?
When?
Which tenant?
Which authenticated account?
Which document?
Which operation?
```

Reuse the existing audit system.

Do not log:

* document contents
* credentials
* signed URLs
* raw tokens

Avoid logging unnecessary sensitive filenames.

---

# 33. Error Handling

Do not expose raw Cloudflare/AWS SDK errors to clients.

Clients should receive controlled application errors.

Appropriately distinguish:

* not found
* forbidden
* invalid file
* file too large
* unsupported type
* storage unavailable
* upload incomplete

Do not leak object existence across tenants.

A Tenant A request for a Tenant B object should follow the application's established secure 403/404 convention without revealing useful information.

Internal errors may include safe correlation identifiers.

Never include secret values.

---

# 34. Timeout / Retry / Resilience

R2 calls must have bounded timeouts.

External storage must not be able to hang application requests indefinitely.

Use bounded retries for genuinely transient failures.

Be careful retrying operations with side effects.

Design object identifiers/idempotency so retries do not create uncontrolled duplicates.

The application must surface persistent-storage failure rather than pretending the operation succeeded.

---

# 35. R2 Outage Behavior

Explicitly test what happens if R2 becomes unavailable.

Required behavior:

```text
Upload requested
→ R2 unavailable
→ operation fails safely
→ DB must not claim AVAILABLE file exists
```

Do NOT:

```text
R2 unavailable
→ write file to Render disk
→ return success
```

For downloads:

```text
authorized document
→ R2 unavailable
→ controlled dependency error
```

Do not incorrectly report "document not found" when the storage dependency itself is unavailable if distinguishing this safely is possible.

---

# 36. Health / Readiness

Do not make every public health request perform an R2 operation.

But provide an operational method to validate storage readiness.

Integrate appropriately with the platform's broader health/readiness architecture if one exists.

Do not expose:

* bucket names unnecessarily
* object keys
* secrets
* endpoints

through public diagnostics.

---

# 37. Local Development

Production R2 configuration must not make local development painful.

Evaluate current development conventions.

Where appropriate support:

```env
STORAGE_PROVIDER=local
```

or a dedicated development R2 bucket.

A local provider is acceptable for local development and automated tests if:

* it uses the same abstraction
* it is clearly non-production
* production cannot silently fall back to it
* path traversal is prevented
* behavior remains compatible enough to test business logic

Production must enforce durable storage.

---

# 38. Environment Separation

Do not use production R2 storage casually for DEV/UAT/tests.

The architecture should support separate environment configuration.

Recommended future bucket separation is:

```text
dijipeople-dev-files
dijipeople-uat-files
dijipeople-prod-files
```

Only the production bucket currently configured is authoritative for production.

Automated tests must never write into the production bucket.

Do not create DEV/UAT infrastructure automatically unless required for testing and authorized.

---

# 39. Future Data Residency

DijiPeople is intended for customers in markets including Pakistan, Qatar, US and potentially other regions.

Do not overengineer regional routing now.

However, do not bake Cloudflare-specific assumptions into domain logic.

The provider abstraction must make it practical later to support alternative object storage for customers with contractual/regulatory residency requirements.

Do not claim that the current R2 bucket satisfies Qatar-specific data-residency requirements unless evidence proves that.

Storage-provider portability is important.

Multi-provider orchestration is NOT part of this task.

---

# 40. Security Tests

Implement strong negative tests.

At minimum verify:

### Cross-tenant read

```text
Tenant A owns Document X
Tenant B knows Document X ID
Tenant B requests X
→ denied
```

### Cross-tenant storage-key knowledge

```text
Tenant A somehow knows Tenant B R2 object key
Tenant A attempts retrieval through application
→ denied
```

### Cross-tenant delete

```text
Tenant A requests delete for Tenant B document
→ denied
```

### Forged tenant ID

```text
Tenant A uploads with tenantId=TenantB
→ cannot create object in Tenant B namespace
```

### Entity ID manipulation

```text
User modifies employee/document/entity ID
→ unauthorized object unavailable
```

### Anonymous access

```text
Unauthenticated user requests private document
→ denied
```

### Permission failure

```text
Authenticated user without document permission
→ denied
```

### Row-scope failure

```text
User has generic permission but not entity/employee scope
→ denied
```

### Oversized upload

```text
file > configured maximum
→ rejected
```

### Invalid file type

```text
unsupported/malformed file
→ rejected
```

### Path/object-key manipulation

Attempts using:

```text
../
encoded traversal
slashes
special filenames
arbitrary object keys
```

must not allow escaping intended object namespace.

---

# 41. Representative Role Testing

Exercise actual DijiPeople roles where they exist, including representative combinations such as:

* Employee
* Manager
* HR
* Tenant administrator
* Delegated administrator
* Global/platform administrator

Use actual permission semantics.

Do not create fake authorization rules merely for tests.

---

# 42. Frontend Integration

Review all frontends that upload/download persistent files.

Update them to use the canonical backend/storage workflow.

Do not allow frontend applications to know:

* bucket credentials
* account access key
* secret access key

If signed URLs are used, frontends may receive only short-lived scoped URLs after API authorization.

Ensure:

* upload progress where appropriate
* error handling
* retry UX where appropriate
* expired signed URL behavior
* upload completion/finalization
* cancellation behavior where relevant

Do not redesign unrelated UI.

---

# 43. Generated Files

For server-generated persistent assets such as contracts, PDFs or reports:

```text
generator
→ storage abstraction
→ R2
→ DB metadata
```

Temporary render artifacts may use OS temporary storage and should be cleaned up.

Once a generated file becomes a persistent business document/downloadable historical artifact, store it durably.

---

# 44. Email Attachments

Inspect email attachment behavior.

Do not blindly move temporary outbound attachment buffers to permanent R2 if no persistent business need exists.

Where email sends an existing document, retrieve it through the storage abstraction.

Where generated attachments are intended to remain business records, store them durably.

Distinguish transient delivery artifacts from persistent records.

---

# 45. Malware Scanning

Determine whether malware scanning currently exists.

If already implemented, preserve it correctly with R2.

If not implemented, do not necessarily block this P0 remediation on deploying a major antivirus subsystem.

However:

* document the current gap
* ensure the storage architecture can support future scanning/quarantine
* avoid architecture that makes future scanning impossible

A future lifecycle could support:

```text
PENDING_SCAN
AVAILABLE
QUARANTINED
```

Do not implement unnecessary infrastructure without justification.

---

# 46. Do Not Add Unrelated Infrastructure

Do not introduce solely for this task:

* Kubernetes
* Kafka
* Redis
* separate storage microservice
* separate file database
* custom CDN
* public R2 bucket
* event streaming platform
* distributed workflow engine
* complex multi-region replication
* unnecessary Worker infrastructure

Keep the implementation simple, secure and maintainable.

---

# 47. Testing Requirements

Run the repository's relevant existing test suites and add missing storage coverage.

Required categories:

## Unit

* configuration validation
* provider selection
* object-key construction
* R2 adapter behavior
* file validation
* signed URL creation where applicable

## Integration

* upload
* metadata
* retrieval
* deletion
* missing object
* R2/storage failure
* failed upload lifecycle
* retry/idempotency
* tenant scoping

## Authorization/security

* cross-tenant read
* cross-tenant delete
* forged tenant
* permission denial
* row-scope denial
* object-key manipulation
* anonymous access

## E2E

Use actual existing high-value document flows.

Prioritize whichever actually exist, such as:

* employee documents
* recruitment CV
* contract/agreement
* tenant asset
* generated report/document

Do not invent nonexistent features merely to satisfy this prompt.

---

# 48. Runtime Persistence Test

This is mandatory.

The P0 is not considered resolved until persistence across compute replacement is proven.

Using a safe environment:

1. Upload a test document through DijiPeople.
2. Confirm the database metadata exists.
3. Confirm the R2 object exists.
4. Download the document through DijiPeople.
5. Verify the contents.
6. Restart/redeploy the API service.
7. Retrieve the same document again.
8. Verify the same object remains accessible.
9. Verify authorization is still enforced.
10. Verify no local persistent file is required.

The acceptance condition is:

> A DijiPeople persistent document survives replacement/redeployment of the API compute instance.

Not merely:

> PutObject returned HTTP 200.

---

# 49. Storage Failure Test

Simulate R2 unavailability safely.

Verify:

```text
persistent upload
→ storage unavailable
→ application returns controlled failure
→ document is not falsely marked AVAILABLE
→ no ephemeral fallback occurs
```

Then restore configuration and verify recovery.

Do not expose secrets during this test.

---

# 50. Migration Validation

If existing files are migrated, verify representative samples through the APPLICATION after migration.

Do not merely verify objects exist through the R2 API.

The actual DijiPeople authorization/download flow must work.

Where checksum is available, compare it.

---

# 51. Performance Validation

Measure representative before/after behavior where practical.

Evaluate:

* upload API memory usage
* upload latency
* download latency
* large allowed upload behavior
* R2 operation counts
* database queries introduced
* redundant `HEAD`/`GET` calls

Avoid unnecessary patterns such as:

```text
HEAD
→ GET
→ HEAD
```

when one request suffices.

Do not optimize blindly.

Measure where possible.

---

# 52. Production Rollout Strategy

Prepare a safe rollout.

Prefer backward compatibility.

A conceptual rollout is:

```text
storage abstraction
→ schema expansion if required
→ application compatibility
→ R2 integration
→ smoke test
→ migrate existing recoverable files
→ verify migration
→ enable canonical R2 writes
→ redeploy/restart persistence test
→ tenant isolation verification
→ retire persistent local-storage paths
→ later contract old schema fields
```

Adjust according to actual code.

Do not make production-destructive schema changes in the initial deployment.

---

# 53. Production Deployment

Do not deploy directly just because implementation succeeds locally.

First complete:

* build
* type check
* lint
* tests
* migration checks
* security tests
* integration tests
* independent review

If this task/environment explicitly authorizes production deployment, deploy only after those gates pass.

Otherwise prepare the deployment and clearly state the remaining manual production action.

Never expose environment variables during deployment output.

---

# 54. Rollback

Define rollback BEFORE final production rollout.

A rollback must not make documents uploaded after R2 enablement inaccessible.

Avoid a schema implementation where reverting application code instantly requires files to exist locally again.

Prefer backward-compatible reads during the transition.

Document exact rollback behavior.

---

# 55. Independent Security Reviewer

After implementation, delegate a fresh review to an agent that did not author the primary storage implementation.

The reviewer must approach the implementation adversarially.

Review:

* tenant isolation
* authorization
* object-key safety
* presigned URL scope
* upload abuse
* MIME/size restrictions
* credentials exposure
* frontend exposure
* local fallback
* object deletion
* orphan handling
* error leakage
* direct R2 access design
* migration correctness

The reviewer must attempt to break the implementation safely.

Critical/high issues must be fixed and retested before completion.

Do not accept "looks correct" as verification.

---

# 56. Search for Remaining Persistent Local Storage

After migration/refactoring, run another repository-wide search.

Identify every remaining local filesystem operation.

For each, classify explicitly:

```text
TEMPORARY — SAFE
```

```text
BUILD/DEV — SAFE
```

```text
PERSISTENT — MUST FIX
```

Do not mark FILE-01 resolved if any reachable production persistent business-file flow still writes only to ephemeral Render filesystem storage.

---

# 57. Documentation

Update appropriate architecture and engineering documentation.

Document:

* storage architecture
* provider abstraction
* R2 configuration
* environment variables
* key structure
* tenant isolation
* upload behavior
* download behavior
* signed URL design
* local development
* migration
* rollback
* operations
* troubleshooting
* credential rotation
* adding another provider later

Do not include secrets.

Follow DijiPeople documentation/Obsidian synchronization rules defined by the repository if applicable.

---

# 58. Audit Remediation Record

Update:

`docs/engineering/audits/2026-09-10-full-technical-audit/REMEDIATION-P0.md`

Cover FILE-01 / INF-05.

Include:

### Original Finding

### Root Cause

### Discovered File Flows

### Architecture Implemented

### Files Changed

### Schema Changes

### Infrastructure/Configuration Changes

### Existing File Migration

### Tests Added

### Upload Security

### Tenant Isolation Verification

### Restart/Redeploy Persistence Verification

### R2 Failure Test

### Independent Reviewer Findings

### Remaining Risk

### Rollback Procedure

### Status

Use only:

`OPEN`

`IMPLEMENTED — NOT VERIFIED`

`VERIFIED RESOLVED`

Do not use `VERIFIED RESOLVED` until runtime persistence and cross-tenant negative tests have actually passed.

---

# 59. Final Repository Validation

Before declaring completion run all applicable repository quality gates:

```text
build
type checking
lint
unit tests
integration tests
E2E tests
authorization tests
tenant-isolation tests
storage tests
migration validation
dependency/security checks
```

Do not:

* disable failing tests
* weaken authorization assertions
* add `skip`
* remove test coverage
* suppress compiler errors
* use broad `any` merely to make builds pass

Fix root causes.

---

# 60. Required Final Report

At completion provide a consolidated report.

## Architecture

Show the final architecture conceptually:

```text
Browser / Client
       │
       ▼
DijiPeople API
       │
       ├── Authentication
       ├── Tenant isolation
       ├── Permission
       ├── Row/entity authorization
       │
       ▼
Document/File Service
       │
       ▼
ObjectStorageProvider
       │
       ▼
Cloudflare R2

Neon PostgreSQL
       │
       └── business/document metadata
```

## File Inventory

For every persistent file feature, show:

```text
Feature
Old storage
New storage
Migration status
Security status
```

## Temporary Local Files

List every intentional local filesystem use still reachable and explain why it is temporary/safe.

## Schema

Explain all schema/migration changes.

## Security

State how the implementation protects:

* tenant isolation
* authorization
* object-key access
* private storage
* signed URLs
* upload abuse
* sensitive filenames
* cross-tenant deletion

## Migration

Provide measured counts:

```text
Existing file records:
Migrated:
Already R2:
Missing source:
Failed:
Not applicable:
```

Do not invent numbers.

## Tests

List all relevant tests executed and their outcome.

## Independent Review

Summarize adversarial reviewer findings and resulting corrections.

## Runtime Validation

Explicitly state whether:

* upload worked
* download worked
* API restart/redeploy occurred
* post-restart download worked
* cross-tenant read failed
* cross-tenant delete failed
* forged tenant upload failed
* R2 outage failed closed

## Remaining Risks

Document anything intentionally deferred.

---

# 61. Final Acceptance Questions

Answer each with YES or NO plus concise evidence.

### Persistent storage

Does DijiPeople still rely on Render ephemeral filesystem storage for any persistent business document?

Expected answer:

`NO`

### R2 privacy

Is the production R2 bucket private?

Expected answer:

`YES`

### Credential exposure

Are R2 credentials inaccessible to browser/client code?

Expected answer:

`YES`

### Tenant isolation

Can Tenant A retrieve Tenant B's files through DijiPeople?

Expected answer:

`NO`

### Delete isolation

Can Tenant A delete Tenant B's files?

Expected answer:

`NO`

### Forged tenant

Can a client force an upload into another tenant's storage namespace by changing a request tenantId?

Expected answer:

`NO`

### Deployment durability

Do persistent documents survive API restart/redeployment?

Expected answer:

`YES`

### Failure behavior

If R2 is unavailable, does production fail safely instead of silently storing persistent files locally?

Expected answer:

`YES`

### Authorization

Are file downloads authorized server-side using DijiPeople's existing permission + row/entity scope model?

Expected answer:

`YES`

### Migration

Have all retrievable existing persistent files been migrated or explicitly accounted for?

Expected answer:

`YES`

---

# 62. Remediation Gate

Only output:

`FILE STORAGE P0: VERIFIED RESOLVED`

if ALL mandatory acceptance criteria have been validated.

Otherwise output:

`FILE STORAGE P0: NOT RESOLVED`

and clearly state what remains.

Do not lower the standard simply because most of the implementation works.

---

# 63. Constraints

Do not:

* expose credentials
* make the R2 bucket public
* introduce client-side R2 credentials
* trust client tenant IDs
* trust arbitrary storage keys
* create public permanent document URLs
* store signed URLs in the database
* silently fall back to Render disk
* delete existing files before verified migration
* introduce unrelated infrastructure
* refactor unrelated modules
* weaken security to simplify implementation
* claim testing that was not performed
* claim production verification without actual evidence
* mark the P0 resolved based solely on static code inspection

---

# 64. Engineering Principle

Favor:

DISCOVER
→ UNDERSTAND
→ DESIGN
→ IMPLEMENT
→ MIGRATE
→ TEST
→ ATTACK
→ VERIFY
→ DOCUMENT

over:

IMPLEMENT QUICKLY
→ ASSUME IT WORKS

The storage implementation should become a foundation used by future DijiPeople functionality.

The end result must support today's Cloudflare R2 configuration without unnecessarily coupling DijiPeople's domain architecture to Cloudflare.

Complete the task end to end.

````

How to feed it to the agent

Given the way your DijiPeople agent framework is already working, I would use a repository task file rather than repeatedly pasting this huge prompt into the conversation. That preserves context and makes the implementation auditable.

Create:

```text
docs/engineering/tasks/R2-DURABLE-STORAGE-IMPLEMENTATION.md
````

Put the entire prompt above into that file.

Then start a fresh Claude Code/agent session from the DijiPeople repository root and send only this launcher:

```text
We are implementing the DijiPeople P0 durable file-storage remediation.

Read and execute the complete task specification:

@docs/engineering/tasks/R2-DURABLE-STORAGE-IMPLEMENTATION.md

Before doing anything, also read:

@AGENTS.md
@docs/engineering/audits/2026-09-10-full-technical-audit/00-EXECUTIVE-AUDIT-REPORT.md

and all relevant storage/security evidence referenced by the task specification.

You are the lead orchestrator.

Use the existing DijiPeople multi-agent framework where useful. Decide yourself which specialist agents should work in parallel and which work must remain sequential.

Do not ask me implementation questions that can be answered by inspecting the repository, schema, existing architecture, audit evidence, tests, or runtime configuration.

Proceed autonomously through:

DISCOVERY
→ DESIGN
→ IMPLEMENTATION
→ MIGRATION
→ TESTING
→ SECURITY REVIEW
→ RUNTIME VALIDATION
→ DOCUMENTATION

Do not stop after planning or after implementing one portion of the work.

Complete the task as far as the available environment safely permits.

Do not expose or print R2 secrets.

Do not deploy directly to production unless the repository/task context explicitly authorizes production deployment.

At the end, give me the consolidated implementation report and the final FILE STORAGE P0 status required by the specification.

Start now.
```

That is better than pasting the giant prompt directly every time because the orchestrator and subagents can reopen the task file whenever context gets compacted.

For your setup, I would actually have three repository-level files controlling this:

```text
AGENTS.md
    ↓
Permanent rules for how DijiPeople agents operate

docs/engineering/tasks/
R2-DURABLE-STORAGE-IMPLEMENTATION.md
    ↓
The current job / acceptance criteria

docs/engineering/audits/
2026-09-10-full-technical-audit/
    ↓
Evidence explaining why the job exists
```

Then the agent has three different levels of context:

```text
AGENTS.md
"How should I work?"

Task specification
"What exactly am I supposed to accomplish?"

Audit evidence
"What did we discover and why does it matter?"
```

One more important point: start a **new agent session** for this implementation rather than continuing the enormous audit session. The audit agent has already consumed a lot of context. A fresh orchestrator that reads the final audit + task specification gets the useful conclusions without carrying all seventeen specialists' raw reasoning in its active context.

And when it says the work is complete, don't immediately tell it to merge. First send this final challenge:

```text
Before I approve this for merge, perform one final independent adversarial validation.

Use a fresh reviewer agent that did not implement the storage solution.

Assume the implementation is insecure or incomplete until proven otherwise.

Specifically attempt to disprove:

1. tenant file isolation
2. delete isolation
3. forged tenantId protection
4. object-key manipulation protection
5. private bucket enforcement
6. credential non-exposure
7. upload size/type enforcement
8. absence of persistent Render-local file dependencies
9. fail-closed behavior when R2 is unavailable
10. persistence after API restart/redeployment
11. migration completeness
12. rollback safety

Re-run relevant build, typecheck, lint, integration, E2E and security tests after any correction.

If you find an issue, fix it and repeat the validation.

Do not merge yet.

Return the final evidence and whether:

FILE STORAGE P0: VERIFIED RESOLVED

is actually justified.
```

Only after that comes back clean would I let the agent merge the branch. This pattern—**implementation agent → independent attack/review → merge**—is worth keeping for all five P0 remediations, not just R2.
