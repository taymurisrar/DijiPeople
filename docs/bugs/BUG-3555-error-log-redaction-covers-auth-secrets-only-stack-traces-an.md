---
ID: BUG-3555
aliases: [BUG-3555]
Title: Error log redaction covers auth secrets only: stack traces and personal or financial values are stored unredacted
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: SECURITY
Source: QA_RUN
DetectedDate: 2026-09-25
DetectedInSha: 75fec5b9
AffectedModules: [services/api/src/modules/error-logs]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: TASK-0032
CreatedAt: 2026-09-25
UpdatedAt: 2026-09-25
ResolvedAt:
---

# BUG-3555 — Error log redaction covers auth secrets only: stack traces and personal or financial values are stored unredacted

## Summary

`sanitizeForErrorLog`, the one function standing between a thrown exception's
payload and the `ErrorLog`/`ErrorLogOccurrence` tables, redacts by matching
object **keys** against a fixed list of authentication/credential substrings
(`password`, `token`, `secret`, `cookie`, `authorization`, `apikey`,
`api_key`, `pass`, `connectionstring`, `database_url`, `jwt`, `otp`, plus a
bare `auth` exact match). It does not match on PII/financial key names
(`bankAccountNumber`, `nationalId`, `ssn`, `iban`, `cardNumber`, `cvv`, `pin`),
and it never inspects the `stack` string at all, so a secret or personal value
interpolated into a free-text error message or stack trace is stored as-is.

## Expected Behavior

Per `AGENTS.md`'s Security checklist ("No password hashes, refresh tokens,
encrypted secrets, full national ids or bank details in responses or logs"),
an error log entry should not retain plaintext PII or financial identifiers,
whether they arrive as a keyed field or as text interpolated into a message
or stack trace.

## Actual Behavior

- `sanitizeForErrorLog` (`sanitize-error-log.ts:18-34`) recurses through an
  object's own keys and redacts a value only when its **key name** matches
  `isSensitiveKey` (line 40-51) — a fixed auth/credential substring list. A
  field named `bankAccountNumber`, `nationalId`, `ssn`, `iban`, `cardNumber`,
  `cvv`, `pin` or `signingKey` is not matched by any pattern in the list and
  is stored verbatim.
- The `stack` field is assigned directly from `exception.stack` at every call
  site in `http-exception.filter.ts` (lines 131, 173, 196, 225, 262, 311)
  **without** passing through `sanitizeForErrorLog` — and even if it did,
  `sanitizeForErrorLog` only redacts by object key, not by scanning free-text
  string content, so a secret interpolated into an error message (e.g.
  `` throw new Error(`Invalid token ${token}`) ``) would survive redaction
  either way once it is part of the `stack`/`message` string rather than a
  keyed field.
- `sanitizeHeaders()` (`sanitize-error-log.ts:36-38`) exists as a wrapper
  around the same key-based redaction, but is **never called** anywhere in
  `services/api/src` outside its own definition — confirmed by repo-wide
  grep. Request headers are not currently persisted into `ErrorLog` (only
  `userAgent`/`ipAddress` are), so this is dormant rather than actively
  leaking today, but it means any future "request headers" panel added to the
  monitoring UI would need this wiring, which does not yet exist.

## Reproduction

1. Trigger a server error whose thrown `Error`'s `message` interpolates a
   sensitive value not covered by the key-based denylist (e.g. a national ID
   or an account number embedded in a validation error string), or whose
   `stack` trace happens to include such a value from a nearby log statement.
2. Observe the persisted `ErrorLog`/`ErrorLogOccurrence` row via
   `error-logs.service.ts` `persist()` — the `stack`/`message` field is stored
   exactly as thrown, with no scanning or redaction applied to its text
   content.
3. Separately, construct an error payload with a field named
   `bankAccountNumber` or `nationalId` and confirm `sanitizeForErrorLog`
   leaves it un-redacted (no substring in `SENSITIVE_KEY_PATTERNS` matches
   either name).

## Evidence

- `services/api/src/common/errors/sanitize-error-log.ts:1-14`
  (`SENSITIVE_KEY_PATTERNS`) — the complete denylist: `password, token,
  secret, cookie, authorization, apikey, api_key, pass, connectionstring,
  database_url, jwt, otp` (plus the bare `'auth'` exact match at line 48). No
  PII/financial pattern (`nationalid`, `ssn`, `iban`, `cardnumber`, `cvv`,
  `pin`, `bankaccount`) appears anywhere in this list.
- `services/api/src/common/filters/http-exception.filter.ts:131,173,196,225,262,311`
  — every `stack: ...` assignment reads `exception.stack`/`normalized.stack`
  directly; none passes through `sanitizeForErrorLog`.
- `services/api/src/common/errors/sanitize-error-log.ts:36-38`
  (`sanitizeHeaders`) — defined, zero call sites found elsewhere in
  `services/api/src`.

## Root Cause

`sanitizeForErrorLog` was designed as a generic **authentication-credential**
denylist (its own pattern list is entirely secret/token-shaped strings), not a
PII/financial-data denylist, and it operates purely on object keys — it has no
mechanism to redact a sensitive value that appears as free text inside a
`message` or `stack` string rather than as a keyed field. `AGENTS.md`'s
Security checklist asks for both categories (secrets **and** national ids/bank
details) to be kept out of logs, but only the first category has an actual
mechanism protecting it.

## Impact

Medium: any error path that happens to interpolate a national id, bank
account number, card number or similar into an exception message, or that
logs such a value adjacent to where a stack trace is captured, will have it
persisted in cleartext in `ErrorLog`/`ErrorLogOccurrence` — visible to any
platform user with `monitoring.read`/error-log access, and included in the
"Diagnostics download" feature (`/api/error-logs/:traceId/download`) offered
from the admin monitoring UI. This is a plausible, not yet confirmed-exploited,
data-exposure surface: no specific interpolation site was found and reproduced
in this discovery pass (this is a defense-in-depth gap, not a demonstrated
active leak). No tenant-isolation or authentication-bypass impact.

## Affected Areas

- `services/api/src/common/errors/sanitize-error-log.ts`
  (`SENSITIVE_KEY_PATTERNS`, `sanitizeForErrorLog`, `sanitizeHeaders`)
- `services/api/src/common/filters/http-exception.filter.ts` (every `stack`
  assignment)
- `services/api/src/modules/error-logs/error-logs.service.ts` (`persist()`,
  the eventual storage point)

## Proposed Resolution

1. Extend `SENSITIVE_KEY_PATTERNS` to include common PII/financial key-name
   fragments (`nationalid`, `ssn`, `iban`, `cardnumber`, `cvv`, `pin`,
   `bankaccount`, `accountnumber`, `taxid`/`ssn`-adjacent terms as
   appropriate), matching the categories `AGENTS.md`'s Security checklist
   names explicitly.
2. Add a bounded, pattern-based scrub (not a full NLP/PII detector — a
   pragmatic regex pass for common shapes: long digit runs that look like
   card/account numbers, national-id formats) over `message`/`stack` text
   before persistence, or at minimum truncate/omit `stack` in production for
   non-internal severities if a text-scrub is judged too risky to get right
   quickly — this needs an Architect decision on scope and acceptable
   false-positive rate.
3. Either wire `sanitizeHeaders()` into the exception filter if headers are
   ever persisted, or remove it if it will not be used, so it does not sit as
   dead code implying a protection that is not applied.
No ExecPlan needed for the key-pattern extension; the message/stack text-scrub
approach should be scoped with the Architect before implementation given the
risk of either false positives (redacting useful debugging context) or false
negatives (missing a shape).

## Acceptance Criteria

- A field named `nationalId`/`bankAccountNumber`/`cardNumber`/etc. is redacted
  by `sanitizeForErrorLog`.
- A documented, tested scrub (or an explicit, Architect-approved decision to
  omit/truncate `stack` in production) prevents a national-id/account-number-
  shaped value embedded in free text from being persisted verbatim.
- `sanitizeHeaders()` is either wired in or removed, not left dormant.

## Regression Coverage

A unit test on `sanitizeForErrorLog` asserting the extended key-pattern list
redacts each new PII/financial key name, failing against the unfixed code.
Any message/stack scrub gets its own pinned test once its exact shape is
decided. No `REG-nnn` entry yet.

## Dependencies

An Architect decision on the scope/approach for the message/stack text-scrub
(see Proposed Resolution point 2) before that part of the fix is implemented;
the key-pattern extension (point 1) has no dependency.

## Related Items

- TASK-0032 — the program that found this.

## Resolution

Not yet fixed.

## QA Retest

Not yet retested.

## History

- 2026-09-25 — created from qa run at `75fec5b9`; discovery stream D4 item 4.
- 2026-09-25 — Architect triage: FIX_NOW (TASK-0032) for the key-pattern
  extension; the message/stack scrub approach needs scoping before
  implementation, per Dependencies.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
