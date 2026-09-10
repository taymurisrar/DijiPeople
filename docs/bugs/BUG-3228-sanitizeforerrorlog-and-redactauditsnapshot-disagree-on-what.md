---
ID: BUG-3228
aliases: [BUG-3228]
Title: sanitizeForErrorLog and redactAuditSnapshot disagree on what to redact, and the weaker one covers persisted query strings and route params
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: SECURITY
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: f36749b3
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

# BUG-3228 — sanitizeForErrorLog and redactAuditSnapshot disagree on what to redact, and the weaker one covers persisted query strings and route params

## Summary

sanitizeForErrorLog and redactAuditSnapshot disagree on what to redact, and the weaker one covers persisted query strings and route params

Identified by the 2026-09-10 full technical audit as OBS-07 (confidence: OBS-07=CONFIRMED).

## Expected Behavior

One key list, shared by both redactors.

## Actual Behavior

`sanitizeForErrorLog` is correct on what it covers — it recurses into nested objects and arrays (lines 21-33), and `refreshToken`, `accessToken`, `Authorization`, `Set-Cookie` and `apiKey` all normalise into its substring list, so the specific concern raised in the brief (a redactor missing `refreshToken` or nested objects) is **not** present. What it misses is the HR data: a query string such as `?search=<national id>` or `?iban=…`, or an `AppError.details` payload carrying `bankAccountNumber` or `basicSalary`, is stored in the clear.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**OBS-07** (services/api/src/common/errors/sanitize-error-log.ts vs services/api/src/modules/audit/audit-snapshot.ts):

The error-log redactor's complete key list — `services/api/src/common/errors/sanitize-error-log.ts:1-14`:
```ts
const SENSITIVE_KEY_PATTERNS = [
  'password', 'token', 'secret', 'cookie', 'authorization', 'apikey',
  'api_key', 'pass', 'connectionstring', 'database_url', 'jwt', 'otp',
];
```
The audit redactor's, written later and for the same class of data — `services/api/src/modules/audit/audit-snapshot.ts:43-58`:
```ts
const SENSITIVE_KEY_NAMES = new Set([
  'cnic', 'nationalid', 'nationalidnumber', 'passportnumber',
  'taxidentifier', 'taxidentificationnumber', 'socialsecuritynumber', 'ssn',
  'accountnumber', 'bankaccountnumber', 'iban', 'swiftcode',
  'swiftorroutingcode', 'routingnumber',
]);
```
`audit-snapshot.ts:4-7` states the rule both are meant to implement: *"`AGENTS.md` forbids password hashes, refresh tokens, encrypted secrets, full national ids and bank details from leaving a service in a response or a log."*
The error path persists `params` and `query` **unconditionally** — `services/api/src/modules/error-logs/error-logs.service.ts:94-96`:
```ts
params: input.params,
query: input.query,
requestBody: config.includeRequestBody ? input.requestBody : undefined,
```
fed from `common/filters/http-exception.filter.ts:136-138` (`params: request.params, query: request.query, requestBody: request.body`). Both then go into `ErrorLogOccurrence.diagnosticJson` (`error-logs.service.ts:156-166`) and are rendered verbatim into the downloadable text file at `modules/error-logs/error-log.formatter.ts:79-86` (`'Route Parameters:'`, `'Query Parameters:'`, `'Request Body:'`).

---


Full finding text: OBS-07 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

Search terms typed by an HR user — routinely a name, a CNIC or an employee code — are persisted on any 4xx/5xx and are readable by any tenant support-role user through `GET /api/error-logs/:traceId/download`, and by any platform admin for every tenant.
**Mitigating fact worth recording:** `includeRequestBody` defaults to **false** (`common/errors/error-config.ts:27-31`) and is set nowhere in the repository, so full request bodies are *not* stored today. That is the single most important thing this code gets right.

## Affected Areas

services/api/src/common

## Proposed Resolution

Export the key sets from one module (extend `sanitize-error-log.ts` with `audit-snapshot.ts`'s `SENSITIVE_KEY_NAMES`), and keep `ERROR_LOG_INCLUDE_REQUEST_BODY` unset in production.

(Difficulty: LOW; Regression risk: LOW; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/src/common/errors/sanitize-error-log.ts vs services/api/src/modules/audit/audit-snapshot.ts (audit id OBS-07).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: OBS-07=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `OBS-07` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (OBS-07) at `f36749b3`.
