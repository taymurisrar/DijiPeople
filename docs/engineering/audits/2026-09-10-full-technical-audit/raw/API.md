# API Inventory and Application Security — DijiPeople 2026-09-10 audit

Area owner: **API** (injection, validation, mass assignment, data exposure, web vulns).
Tenant isolation, authn, authz and rate limiting are owned by other specialists;
anything found here that belongs to them is called out at the end and not
re-litigated.

Method: static read of `services/api/src`, `apps/web`, `apps/admin`,
`apps/landing` at `origin/develop@f55cf4b2` (worktree `agent/full-technical-audit`).
A route inventory (method, path, handler, body-parameter type, guards, decorators)
was extracted for all 1273 route decorators across all 111 controllers with a
small Node script and then read against source for every finding below — every
count in this report is derived from that inventory or from a direct grep, not
estimated.

---

## 1. Endpoint inventory

**1273 route handlers across 111 controllers**, matching the briefing's stated
scale exactly.

- By HTTP method: `GET 554, POST 441, PATCH 162, DELETE 103, PUT 13`.
- By module: see [Appendix A](#appendix-a--routes-by-module) (69 modules incl. `root`).
  `payroll` (92), `super-admin` (90) and `tenant-settings` (71) are the three
  largest surfaces.

**Duplicate/legacy routes:** **0**. Grouping all 1273 routes by `METHOD + full
path` produced zero collisions — no two controllers register the same
method+path pair. **NOT OBSERVED.**

**Dangerous-by-name routes:** grepped `full path + handler name` for `raw`,
`exec`, `proxy`, `debug`, `impersonate`, `sync-all`/`sync`, `unsafe`,
`internal`, `bypass`, `override`. **14 matches, all legitimate domain actions**,
not backdoors:

| Route | Guards |
|---|---|
| `PATCH /api/attendance/:entryId/override` | JwtAuthGuard, PermissionsGuard, EntitlementGuard |
| `POST /api/integrations/attendance/devices/:id/sync-now` | JwtAuthGuard, PermissionsGuard |
| `GET/POST/PATCH /api/integrations/attendance/sync-policies[...]` (4 routes) | JwtAuthGuard, PermissionsGuard |
| `POST /api/benefits/assignments/:id/override` | JwtAuthGuard, PermissionsGuard |
| `POST /api/data-management/imports/:jobId/execute` | JwtAuthGuard, PermissionsGuard |
| `GET/PATCH /api/configuration/currencies/:id/manual-override` (2 routes) | JwtAuthGuard, PermissionsGuard |
| `POST /api/reporting/reports/execute` | JwtAuthGuard, PermissionsGuard |
| `DELETE /api/super-admin/platform-settings/exchange-rates/:quoteCurrency` (`clearExchangeRateOverride`) | JwtAuthGuard, RolesGuard, PlatformPermissionsGuard |
| `POST /api/timesheets/:id/weeks/:id/late-submission-override` | JwtAuthGuard, PermissionsGuard, EntitlementGuard |
| `POST /api/timesheets/:id/weeks/:id/withdraw` | JwtAuthGuard, PermissionsGuard, EntitlementGuard |

None are `@Public()`. No `/raw`, `/exec`, `/proxy`, `/debug` or `/impersonate`
literal segment exists anywhere in the 1273 routes. **CONFIRMED.**

One route family is worth flagging separately, not as dangerous-by-name but as
a deliberately unusual auth pattern reviewers should know about:
`POST /api/app-releases/publisher/publish` and `.../promote`
(`services/api/src/modules/app-releases/release-publisher.controller.ts:122,163`)
carry `@Public()` at the method level, which looks like an unauthenticated
release-publishing endpoint. It is not: the controller class carries
`@UseGuards(ReleasePublishTokenGuard)`, which the file's own comment (lines
103-113) explains fails closed when `RELEASE_PUBLISH_TOKEN` is unset — `@Public()`
here only means "not a user session; a CI machine credential instead." Confirmed
by reading the guard wiring. **CONFIRMED, healthy.**

23 routes total are `@Public()` **and** `POST` — all are auth
(login/refresh/logout/signup/forgot-password/reset-password/activate),
public lead/onboarding capture, or the two release-publisher routes above,
plus the Stripe webhook (§12). **No unexplained public mutation route exists.**

---

## 2. Input validation

The global `ValidationPipe` (`main.ts:118-124`) enables `whitelist`,
`transform`, `forbidNonWhitelisted`. That protection applies **only** to a
`@Body()` parameter typed as a class-validator DTO class — it does nothing for
a body typed `Record<string, unknown>` or an inline object-literal type, because
there is no class shape to whitelist against.

Of **719 mutating routes** (POST/PUT/PATCH/DELETE), **473 declare a `@Body()`
parameter**; the rest take only params/query or no body. Scanning all 473 body
types for `any`, `object`, `Record<string, ...>`, `unknown`, an inline `{...}`
literal, or no type annotation at all found **38 routes (8% of bodied mutating
routes)** across **9 controllers** whose body bypasses `ValidationPipe`
whitelisting entirely:

| Controller | Routes | Pattern |
|---|---|---|
| `error-logs.controller.ts` | 1 | `Record<string, unknown>` |
| `data.controller.ts` | 2 | `Record<string, unknown>` |
| `inbox.controller.ts` | 1 | inline `{ status?: string }` |
| `configuration.controller.ts` (lookups) | 3 | `Record<string, unknown>` |
| `lookups.controller.ts` | 4 | `Record<string, unknown>` |
| `onboarding.controller.ts` | 1 | inline `{ recordIds?; ids? }` |
| `payroll-gl.controller.ts` / `payroll-operations.controller.ts` | 4 | inline object literals |
| `platform-monitoring.controller.ts` | 1 | `Record<string, unknown>` |
| `candidates.controller.ts` (recruitment) | 1 | inline `{ recordIds?; ids? }` |
| `enterprise-configuration.controller.ts` (tenant-settings) | 11 | `Record<string, unknown>` |
| `field-security.controller.ts` (tenant-settings) | 4 | `Record<string, unknown>` |

Full list with file:line in [Appendix B](#appendix-b--validation-gap-routes).

**Two distinct risk levels within this list, verified by reading the service
behind each:**

- **`POST /api/error-logs/client`** (`error-logs.controller.ts:25`,
  `persistClientLog`) — `@Body() body: Record<string, unknown>`. No length
  bounds, no enum validation, arbitrary nested `body.details` stored verbatim.
  **KNOWN — OBS-08** (`docs/engineering/audits/.../raw/OBS.md:375`) already
  covers this in depth (unvalidated body, no rate limit). I independently
  confirmed the same code path; folding in rather than re-deriving. **CONFIRMED.**

- **The `data.controller.ts` generic-entity routes** (`create`/`update` for
  custom tables) — `Record<string, unknown>` is the *correct* shape here: this
  is the metadata-driven runtime entity API AGENTS.md describes, and
  `CustomDataService.create`/`.update`
  (`services/api/src/modules/data/custom-data.service.ts:206,258`) runs the body
  through `validateValues(table, body, ...)`, which validates against the
  table's own field-metadata schema before persisting into a JSON column. This
  is a deliberate, working alternative to a compile-time DTO. **CONFIRMED
  healthy** — not counted as a gap in the severity rollup below.

- **The remaining 35 routes** — `lookups`, `configuration` (currencies),
  `enterprise-configuration` (holiday calendars, work schedules, shift
  templates, payroll regions, fiscal years), `field-security`, `inbox`,
  `onboarding`/`candidates` bulk-delete, `payroll-operations` import/reconcile —
  all follow one consistent pattern I verified by reading the service behind
  four of them (`enterprise-configuration.service.ts:102` `createHolidayCalendar`,
  `lookups.service.ts:114` `createState`, `field-security.controller.ts:184`
  `create`): the controller takes `Record<string, unknown>`, and the service
  reads each field explicitly by name through small typed helpers
  (`requiredString`, `readNullableString`, `readEnum`, `normalizeCountryCode`,
  etc.) rather than spreading the body. **This means these are not mass-assignment
  risks** (§3) — but they are **not going through `class-validator`, so none of
  ValidationPipe's declarative guarantees apply**: no centralized `@MaxLength`,
  no `@IsEnum`, no `forbidNonWhitelisted` 400 on an unexpected field (unknown
  fields are just silently ignored by the reader functions instead of rejected).
  A malformed or oversized value only fails if the specific hand-written reader
  happens to check for it. This is a genuine, systemic deviation from the
  project's own documented convention ("Every request body has a DTO with
  class-validator rules" — AGENTS.md, Backend section) across 35 routes in 4
  modules. **CONFIRMED**, not found recorded as its own bug in `docs/bugs/`
  (grepped `Record<string, unknown>` — the 10 hits found are unrelated bugs
  about other symptoms) — **NEW**.

**Finding API-01** below.

---

## 3. Mass assignment

Grepped every `...dto`, `...body`, `...input`, `...payload` spread inside
`services/api/src/modules/**/*.service.ts` and `*.repository.ts`: **22 files,
35 spread sites**. Critically, **zero sites spread `...body` directly** — every
raw, untyped `Record<string, unknown>` body identified in §2 is consumed via
named-field readers, never spread. The spreads that exist are all `...dto`
(a validated class-validator instance) or a narrow internal TS interface.

I read the code around every one of the 22 files. The dominant, and correct,
pattern is an explicit field-mapper function between the DTO and the Prisma
`data` object — e.g. `employees.service.ts` `buildCreateData()` (line 3130)
maps `CreateEmployeeDto` field-by-field into `Prisma.EmployeeUncheckedCreateInput`
even though an internal `{...dto, ...scopeDefaults}` merge happens one call
earlier for computation purposes only; `salary-package-rules.service.ts`
`ruleData()` (line 457) does the same with conditional-spread-per-field. Neither
lets a DTO's full shape reach Prisma unfiltered.

**One real finding**, found by then checking what each spread DTO's class
actually declares:

**`support-cases.service.ts:344`** — `update()` does
`tx.supportCase.update({ where: { id }, data: { ...dto, assignedToUserId: dto.assignedToUserId, ... } })`
where `dto: UpdateSupportCaseDto`. That DTO
(`services/api/src/modules/support-cases/dto/support-cases.dto.ts:84`) declares:

```ts
@IsOptional() @IsUUID() tenantId?: string;
```

— a client-settable `tenantId` field, spread straight into the Prisma update.
**I traced the reachability**: `support-cases.controller.ts` guards this route
with only `JwtAuthGuard` (no `@Permissions`/`@RequirePermission`), and
`SupportCasesService.get()`/`.update()` call `this.assertPlatform(user)` before
anything else (`support-cases.service.ts:221`) — so this is a **platform-admin-only,
intentionally cross-tenant support desk** (DijiPeople staff managing support
cases *about* any customer tenant), not a tenant-scoped endpoint, and
`tenantId` here is a legitimate "which customer is this case about" field that
`create()` already accepts directly from the client at line 258
(`tenantId: dto.tenantId`) by design. **This is not a tenant-isolation break** —
it does not let a tenant end-user touch another tenant's data, because tenant
end-users cannot pass `assertPlatform`. **Route this to AUTHZ**, though: I did
not verify what distinguishes *which* platform roles can reach
`support-cases.*` from `assertPlatform`, i.e. whether a low-privilege platform
support agent can silently reassign a case's owning tenant to an arbitrary UUID
with no existence check beyond the DB foreign key. **LIKELY** (the write-path
code is CONFIRMED; the platform-role-scoping question is AUTHZ's call).

No other DTO among the 35 spread sites declares `tenantId`, `id`, `createdById`,
a status/approval field, or a money field that the domain should compute.
Spot-checked `CreatePartnerCommissionDto` (`commissionAmount` is computed after
the spread, overriding any client value) and `UpdateSupportCaseDto`'s siblings —
clean.

**Verdict: mass assignment is well-defended in this codebase.** The one
finding is a design question for AUTHZ, not a code defect for API.

---

## 4. Injection

**Raw SQL: 4 sites total, all parameterized, zero string concatenation.**
Grepped `$queryRaw`, `$executeRaw`, `queryRawUnsafe`, `executeRawUnsafe` across
all of `services/api/src`: `prisma.service.ts:139` (tagged template, no
interpolation), `outbox-dispatcher.service.ts:180` and `outbox.service.ts:58`
(tagged templates with `${...}` interpolations — Prisma auto-parameterizes
these), `payroll.service.ts:443` (`Prisma.sql` helper for an advisory lock,
also parameterized). **Zero `*Unsafe` variants exist anywhere in the codebase.**
**CONFIRMED, healthy.**

**Dynamic Prisma `orderBy`/`where`/`select` from client strings**: found 3
sites using computed-property-key `orderBy: { [sortBy]: ... }`
(`attendance-device.service.ts:94`, `attendance-integration.service.ts:121`,
`customization.service.ts:4922`). All three are allowlisted before use — e.g.
`attendance-device.service.ts:77-87` builds `allowedSort = new Set([...6
fields])` and only uses `query.sortBy` if `allowedSort.has(query.sortBy)`,
defaulting to `'name'` otherwise. The third (`customization.service.ts`) sorts
by `primary.columnKey`, a server-side metadata field, not client input at all.
**CONFIRMED, healthy** — even without an allowlist, an unknown field name
passed to Prisma throws a validation error rather than executing arbitrary SQL,
since Prisma validates keys against the generated client's known model shape;
these three routes additionally prevent that error-based field enumeration.

**`eval`/`new Function`/`child_process`**: zero reachable from any request path.
Grepped the whole of `services/api/src` for `eval(`, `new Function(`,
`child_process`, `execSync`, `spawnSync`; every hit was a `RegExp.exec()` call,
unrelated. **NOT OBSERVED.**

**Template injection in rendering**: no real template-engine (Handlebars/EJS/
Nunjucks/Mustache) is installed or used — two comments in `contracts.service.ts`
and `legal.service.ts` merely *mention* Handlebars/Liquid while explaining why
their own custom `{{token}}` syntax is deliberately narrower. Two custom
placeholder renderers were read end-to-end:

- **Email templates** (`email-template-renderer.service.ts:83-96`) —
  `renderTemplateString()` replaces `{{var}}` via regex and calls
  `escapeHtmlValue(value)` for every substitution when rendering the HTML body.
  **CONFIRMED, healthy.**
- **Contract documents** (`contracts.service.ts:5428` `renderContractPlaceholders`)
  — every branch escapes: the default branch calls `escapeHtml(formatPlaceholderValue(...))`;
  the `TABLE`/`REPEATING_COLLECTION` branch (`renderCollectionValue`, line 5635)
  escapes every cell, header and list item individually; the
  `SIGNATURE`/`INITIALS` branch (`renderSignatureValue`, line 5628) escapes
  free text and only emits an unescaped `<img>` tag when the value matches a
  strict `^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$` regex (no injection
  surface through that path). Uploaded DOCX/PDF/HTML contract documents are
  additionally sanitized through `cleanContractHtml()`
  (`contracts.service.ts:5256`, an allowlist `sanitize-html` config — no
  `script`, no event-handler attributes) inside `create()` at line 1272
  (`const contentHtml = cleanContractHtml(rawHtml)`) **regardless of source**
  (uploaded file, template, or client-supplied `dto.contentHtml`). **CONFIRMED,
  healthy** — traced the full pipeline: upload → `convertContractDocumentToHtml`
  (mammoth for DOCX, `escapeHtml`-wrapped paragraphs for PDF/plain-text) →
  `cleanContractHtml` (allowlist sanitize) → `renderContractPlaceholders`
  (escape-on-substitution) → stored `contentHtml` → later rendered via
  `dangerouslySetInnerHTML` in three frontend locations (§6). This is one of
  the stronger-engineered subsystems in the codebase for this class of bug.

**Finding: none for injection.** Section documented primarily as a healthy
result.

---

## 5. SSRF

Grepped for `axios`, `fetch(`, `HttpService`/`@nestjs/axios`, `node-fetch`,
`undici`, `got(` across `services/api/src/modules`. Only **2 files** make
outbound HTTP calls at all: `lookups/geographic-lookup.service.ts` (lines
176, 282, 358) and `super-admin/platform-fx.service.ts` (lines 46, 491) — and
in both, the target URL is a **hardcoded literal** (`https://countriesnow.space/...`,
`https://open.er-api.com/...`), never built from request input. No `HttpService`/
`@nestjs/axios` is used anywhere; no `node-fetch`/`undici`/`got` dependency is
imported in `services/api/src`.

Specifically checked, per the briefing's list, and found **none**:
- **Branding/logo "fetch by URL"**: `branding-assets.service.ts` only stores
  and returns a `logoUrl` string; nothing in the API dereferences it
  server-side (the frontend renders `<img src>` directly — that's a §6
  question, not SSRF).
- **Document import by URL**: grepped `importUrl`/`sourceUrl`/`documentUrl`/
  `fileUrl` — only DTO field names in `recruitment` unrelated to fetching.
- **Tenant domain verification**: `tenant-domain.service.ts:447` explicitly
  states *"DNS verification is not automated in this deployment. Confirm the
  TXT record with the DNS provider, then mark the domain verified through
  platform operations."* — no automated DNS or HTTP resolution against
  admin-supplied input exists. **CONFIRMED, healthy.**
- **OAuth callbacks**: no OAuth callback handler found (the one "oauth" hit
  in the whole modules tree is an unrelated comment in
  `document-parsing.service.ts`).
- **Webhook delivery**: no outbound webhook-dispatch code found (`notifications`
  delivers via the internal catalog→orchestrator→queue→processor pipeline to
  email/in-app, not to arbitrary tenant-supplied URLs).

**Verdict: NOT OBSERVED** — no SSRF vector exists in the API as currently
built, because there is essentially no server-side "fetch a client-supplied
URL" capability at all. This is a stronger result than "mitigated"; the attack
surface itself is absent.

---

## 6. XSS / rendering

`grep -rl dangerouslySetInnerHTML` across `apps/web`, `apps/admin`,
`apps/landing`: **6 files**. `grep -rl '\.innerHTML\s*='`: **0 files** (no
vanilla-JS `innerHTML` writes anywhere in any of the three apps).

| File | Content | Verdict |
|---|---|---|
| `apps/web/app/layout.tsx:78`, `apps/admin/app/layout.tsx:104` | Static inline theme-bootstrap `<script>` (constant string, FOUC-prevention pattern) | **Healthy** — not user input |
| `apps/admin/app/_components/documents/contract-document-editor.tsx:972` | `previewHtml ?? editor.getHTML()`, where `previewHtml` traces to `/api/contracts/:id/document-fields` → the `renderContractPlaceholders`/`cleanContractHtml` pipeline verified safe in §4 | **CONFIRMED healthy** for the API-sourced path; `editor.getHTML()` is the admin's own TipTap WYSIWYG content (self-XSS territory only) |
| `apps/admin/app/_components/runtime/runtime-record-page.tsx:1095` | `resolvedHtml` from the same `/api/contracts/:id/document-fields` endpoint, comment states *"Server-rendered from the sanitized document with escaped values"* | **LIKELY healthy** — same API endpoint as above, not re-verified independently at the controller layer |
| `apps/admin/app/_components/documents/contract-template-editor.tsx` (feeds the editor above) | `placeholderExamples` from `/api/contracts/placeholder-definitions` — a fixed system catalog of sample/example values, not live tenant data | **Healthy**, low-impact even if unescaped (admin-only preview, static catalog) |
| `apps/landing/app/sign/[token]/signing-experience.tsx:160` | `session.document.contentHtml`, the same server-stored, already-`cleanContractHtml`-sanitized field, with a client-side regex only substituting a static placeholder box for `{{signature.*}}` tokens | **CONFIRMED** the stored value passed through the safe pipeline (§4); this is the **public, unauthenticated** signing page, so it is the highest-consequence of the six if that pipeline were ever bypassed — worth AUTHZ/QA keeping an eye on whenever `contentHtml` gets a new write path |

**No stored/reflected XSS found.** All six `dangerouslySetInnerHTML` sites
either render constant strings or values that pass through the verified
escape/sanitize pipeline in §4. **CONFIRMED for 4 of 6, LIKELY for 2** (the two
`runtime-record-page.tsx`/`contract-template-editor.tsx` paths — same API
surface, not independently re-verified at the controller).

Employee names, notes and custom-field values were **not** found rendered via
`dangerouslySetInnerHTML` anywhere — those render through normal JSX text
interpolation (React's default escaping), which is the correct default and
was not further audited beyond confirming no `dangerouslySetInnerHTML`/`innerHTML`
bypass exists for them.

`javascript:` scheme in user-controlled `href`/`src`: **not separately audited**
— out of time budget; flagged under Not examined.

---

## 7. CSRF

Auth cookies (`buildAuthCookieOptions`, `services/api/src/common/config/auth.config.ts:296-356`):
`httpOnly` defaults `true`, `secure` defaults to production-like, **`sameSite`
defaults to `'lax'`** (line 314), and the function throws at startup if
`sameSite === 'none'` without `secure` in production. `docs/environment-variables.md:140`
documents the shipped default as `COOKIE_SAME_SITE=lax`; `render.yaml` does not
override it.

**No CSRF token mechanism exists** — grepped `csrf`/`Csrf`/`CSRF`/`xsrf` across
`services/api/src`: zero hits. No `csurf`, no double-submit-cookie pattern, no
custom-header check on mutating routes.

**Assessment**: `SameSite=Lax` blocks the auth cookie from being attached to a
cross-site `POST`/`PUT`/`PATCH`/`DELETE` (Lax only forwards cookies on a
top-level `GET` navigation), which is the primary modern CSRF defense and
covers the classic "malicious HTML form auto-submits to the API" attack for
every mutating route in this inventory. Combined with the strict, non-reflecting
CORS allowlist (§8), a cross-origin script cannot forge a credentialed JSON
request either. The gap is **defense-in-depth, not an open door**: there is no
explicit `Origin`/`Referer` check on mutating routes as a second layer, so a
future misconfiguration that widens `SameSite` (e.g. to support a legitimate
cross-subdomain use case) would have no independent backstop. **CONFIRMED**
(cookie config) / **LIKELY** (no scenario found where this is currently
exploitable, but not exhaustively tested against every one of the 719 mutating
routes). Rated LOW — not a defect to fix urgently, a hardening recommendation.

---

## 8. CORS / headers / clickjacking / host-header

**CORS** (`buildCorsOptions`, `services/api/src/config/env.validation.ts:115-170`):
strict allowlist via `origin(origin, callback)` — checks `allowedOrigins.has(origin)`
then `matchesWildcardOrigin(origin, configuredOrigins)` (suffix+protocol-matched
`*.` wildcard support, e.g. would match a configured `*.vercel.app` entry if
one is present in the runtime `CORS_ALLOWED_ORIGINS` env var — not inspectable
from this static, read-only checkout; the orchestrator's live confirmation
stands for the runtime value). Disallowed origins get `callback(null, false)`,
**never `callback(new Error(...), false)`** — a large code comment (lines
137-160) documents this was itself a bug (**BUG-0976**, already fixed): passing
an `Error` made CORS rejection throw, which the exception filter rendered as a
500 and persisted through `ErrorLogsService`, letting anyone spam the error-log
table from any origin. Origins default to the three app origins
(`getAppOrigin('landing'|'web'|'admin')`) via `packages/config/index.js:265-280`
when `CORS_ALLOWED_ORIGINS` is unset. **No origin reflection (`origin: true`)
anywhere.** **CONFIRMED, healthy, KNOWN fix (BUG-0976)** for the specific
error-amplification bug; the underlying strict-allowlist design was not itself
a finding.

**Security response headers**: **not independently re-derived** — `OBS-28`
(`.../raw/OBS.md:1309`) already states *"The API sets no security response
headers: no HSTS, no `nosniff`, helmet is not installed."* I spot-checked this
is consistent with `main.ts` (no `helmet()` call present, no `app.use` setting
`X-Content-Type-Options`/`X-Frame-Options`/`Strict-Transport-Security`).
**KNOWN — OBS-28**, folding in rather than re-deriving per the briefing.

**Host-header trust**: `resolveRequestHostname()`
(`services/api/src/modules/tenant-domains/request-hostname.ts:26-35`) only
trusts `X-Forwarded-Host` when `isProxyTrusted(request)` says a proxy is
actually configured in front (`TRUST_PROXY_HEADERS`/Express `trust proxy`),
falling back to the raw `Host` header otherwise — with an explicit code
comment stating *"Nothing here reads a tenant id from a header."* Separately,
password-reset link generation (`auth.service.ts:176,450`) builds the reset
URL from **`getAppOrigin('web'|'admin', process.env)`** — a server-configured
origin — not from any request header. **CONFIRMED, healthy**: no host-header
poisoning path into password-reset links or tenant resolution.

**Clickjacking**: covered by the same OBS-28 gap (no `X-Frame-Options`/
frame-ancestors CSP) — **KNOWN — OBS-28**, not independently re-derived.

---

## 9. Sensitive data exposure

Per the briefing, this is primarily **OBS's** territory and it is covered in
unusual depth there — OBS-24 (plaintext bank accounts/IBANs/CNICs/tax ids while
an AES-256-GCM service sits unused in the same codebase), OBS-25 (`FieldSecurityRule`
masking enforced only client-side, API sends the full value), OBS-26 (employee
list/detail projection returns CNIC/DOB/home address/emergency contacts/tax id
to anyone holding `dashboard.view`), OBS-07 (two redactors disagree on which
fields to scrub from logs), OBS-30/31 (error-log downloads/fingerprints leak
route params, query strings, IPs). I did not re-derive any of these — they are
**KNOWN**, cite OBS directly.

From my own endpoint-inventory vantage point, one supporting data point: I
grepped for `passwordHash`/`refreshTokenHash`/`encryptedSecret` being returned
from a service without an explicit `select`, across all `*.service.ts` — **zero
hits**. This doesn't contradict OBS's findings (which are about PII/financial
fields, not credential fields) — it's a narrower **NOT OBSERVED** for the
credential-leakage sub-case specifically, offered as a supporting negative
result alongside OBS's broader PII findings, not a substitute for them.

---

## 10. Error handling

`HttpExceptionFilter` (`services/api/src/common/filters/http-exception.filter.ts`):

- Client-facing `contract.stack` is only populated when **both**
  `config.verboseResponse` (from `ERROR_VERBOSE_RESPONSE`, defaults `false` —
  `error-config.ts:46`) **and** `canExposeStack()` — which additionally
  requires the caller to hold `isSystemCustomizer`/`system-customizer` role
  (lines 342-351) — are true. `render.yaml` does not set `ERROR_VERBOSE_RESPONSE`,
  so production runs the safe default. **CONFIRMED**: stack traces do not reach
  ordinary clients in production.
- Prisma errors are mapped through `mapPrismaError()` (line 225) to catalog
  entries (`DATABASE_DUPLICATE_RECORD`, `DATABASE_RECORD_NOT_FOUND`,
  `DATABASE_CONSTRAINT_FAILED`, etc.) with catalog-defined generic messages —
  **raw Prisma error text (table/column/constraint names) is never placed in
  the client-facing `message`/`description` fields**, only ever in the
  server-side log/error-log persistence path (`errorLogsService.persist`,
  `logger.error`), which is a different, internal sink. **CONFIRMED, healthy.**
- `NODE_ENV`/environment: not independently re-derived — the orchestrator
  already confirmed live `environment: production`; I confirmed the code-level
  behavior is safe for that state.

**No finding here** — this is a genuinely well-designed error contract.

---

## 11. Pagination / response size

Checked every DTO field named `pageSize`/`limit`/`take` across
`services/api/src/modules/**/*.dto.ts` (24 such fields, 22 files): **23 of 24
carry an explicit `@Max(...)` cap** (`@Max(100)` is the dominant value — e.g.
`employee-query.dto.ts:145`, `audit-log-query.dto.ts:57`,
`in-app-notification-query.dto.ts:23`). The one exception,
`agent/dto/dlp-capture.dto.ts:197` (`limit?: number`, no `@Max`), is enforced
instead in the service layer: `dlp.service.ts:324,347` —
`Math.min(query.limit ?? DEFAULT_ALERT_LIMIT, MAX_ALERT_LIMIT)`. **Effectively
24 of 24 paginated list endpoints cap page size.** **CONFIRMED, healthy** —
this is a disciplined pattern, not a gap.

**Two unpaginated list endpoints found** by reading the largest `super-admin`
surface directly:

- **`SuperAdminService.listTenants()`** (`super-admin.service.ts:974`) —
  `this.tenantsRepository.findAllForSuperAdmin()` with no `take`/`skip`, then
  `Promise.all(tenants.map(...))` (an N+1 pattern, flagged to performance/other
  specialists, not scored here). Serves `GET` on the platform tenant list.
- **`SuperAdminService.listAgentAssignments()`** (`super-admin.service.ts:990-997`)
  — `this.prisma.tenant.findMany({ select: {...}, orderBy: {...} })`, no cap.

Both are platform-admin-only surfaces whose result size is naturally bounded
by "number of paying tenants," not by arbitrary user data — so exploitability
is low today, but there is no code-level cap, and AGENTS.md's own convention
(§Testing/pagination coverage) doesn't distinguish "naturally small" from
"capped." **CONFIRMED**, **NEW** (not found in `docs/bugs/` — grepped
`listTenants`, `unbounded.*findMany`, `no pagination`, no match). Rated LOW —
naturally bounded today, becomes a real cost/latency issue only at a tenant
count this product hasn't reached.

**Broader heuristic, not individually verified**: a script flagging every
`.findMany(` call with no `take:` within the following 15 lines found **422
call sites** across 133 files. The two above were the only ones I traced end
to end to an unpaginated *client-facing list endpoint*; the great majority of
the 422 are internal bounded lookups (a tenant's own settings rows, a single
policy's rules, lookup tables) where "no `take`" is correct because the result
set is inherently small. I did not have budget to individually verify all 422.
**Flagged under Not examined** for QA/performance follow-up rather than scored
as a finding — asserting all 422 are a problem would be exactly the
"evidence, not vibes" failure mode the briefing warns against.

---

## 12. Webhooks

**Stripe** (`services/api/src/modules/billing/controllers/stripe-webhook.controller.ts`):

- `POST /api/billing/stripe/webhook` is `@Public()` but requires the
  `stripe-signature` header (line 55) and a **raw `Buffer` body** (line 62) —
  `main.ts:147-159` wires `raw({ type: 'application/json', limit: '2mb' })`
  scoped to exactly this one path, applied **before** the global JSON body
  parser (`isStripeWebhookRequest()` check at line 172/183), so signature
  verification runs against the untouched raw bytes rather than a re-serialized
  JSON string (a common real-world bug the code explicitly guards against).
- Signature verification (`billing.service.ts:1173-1187`,
  `verifyWebhookSignature`) calls the **official Stripe SDK**
  `this.stripeBillingService.client.webhooks.constructEvent(payload, signature,
  webhookSecret)` — genuine HMAC verification against `STRIPE_WEBHOOK_SECRET`,
  not a hand-rolled comparison. Any failure throws `BadRequestException`.
  **CONFIRMED — this directly refutes the briefing's flagged risk** ("Unverified
  Stripe webhook = CRITICAL"): the webhook **is** verified, correctly.
- **Idempotency/replay protection**: `WebhookService.processStripeEvent()`
  (`webhook.service.ts:165-182`) looks up a `StripeWebhookEvent` record keyed
  by Stripe's event id first; if `processingStatus` is already `PROCESSED` or
  `IGNORED`, it returns `{ duplicate: true, ... }` without re-dispatching.
  **CONFIRMED, healthy** — genuine replay protection, not just logging.
- The controller's own `refuse()` helper deliberately does **not** log the raw
  body or signature on rejection (comment at lines 24-37 explains why:
  "the body is a customer's payment detail and the signature is a credential"),
  citing a prior incident (**BUG-1543**, `docs/bugs/BUG-1543-...md`) where an
  earlier version of this endpoint's opaque `VALIDATION_FAILED` response made
  a real production rejection hard to diagnose. **KNOWN — BUG-1543** informs
  this design; the current code is the fix, already shipped.

**Other inbound webhooks**: filtered the full route inventory for `isPublic &&
method === 'POST'` — **23 routes total**, and `/api/billing/stripe/webhook` is
the **only one** shaped like a third-party inbound webhook (the rest are
auth/signup/lead-capture/release-publish, covered in §1). Device/gateway
attendance ingestion (`attendance-integrations` module, 59 routes) carries
**zero `@Public()` controllers** — ingestion is authenticated (JWT/API-key
guarded), not an unauthenticated inbound webhook, so it doesn't carry the
"unverified webhook" risk class at all; whether the device/gateway credential
model itself is sound is an AUTHZ/AUTHN question, not this section's.

**Verdict: the one webhook receiver that matters is correctly built.**
Strongest healthy finding in this report.

---

## Findings

### API-01 — 35 mutating settings/lookup routes take `Record<string, unknown>` bodies, bypassing `ValidationPipe` whitelisting entirely

- **Category:** Input Validation
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW (the sibling `error-logs.controller.ts` case is KNOWN as OBS-08; these 35 are not previously recorded)
- **Component:** `services/api/src/modules/lookups/{lookups,configuration}.controller.ts`, `services/api/src/modules/tenant-settings/{enterprise-configuration,field-security}.controller.ts`, `services/api/src/modules/inbox/inbox.controller.ts`, `services/api/src/modules/onboarding/onboarding.controller.ts`, `services/api/src/modules/recruitment/candidates.controller.ts`, `services/api/src/modules/platform-monitoring/platform-monitoring.controller.ts`
- **Evidence:**
  `services/api/src/modules/tenant-settings/enterprise-configuration.controller.ts:47` —
  `createHolidayCalendar(@CurrentUser() user, @Body() body: Record<string, unknown>)`.
  `services/api/src/modules/tenant-settings/enterprise-configuration.service.ts:102-155` —
  the service hand-reads `body.name`, `body.countryCode`, `body.weekendDays`, etc.
  via typed helper functions, with no centralized length/enum validation.
  `services/api/src/modules/lookups/lookups.service.ts:114-117` — same pattern
  for `createState`.
- **Current behaviour:** these 35 routes accept any JSON object; `ValidationPipe`'s
  `whitelist`/`forbidNonWhitelisted` do not apply because there is no
  class-validator DTO; the service layer picks named fields via ad hoc reader
  functions, so validation coverage is whatever each reader happens to check,
  and unexpected extra fields are silently ignored rather than rejected with a 400.
- **Expected behaviour:** per AGENTS.md's own Backend convention ("Every
  request body has a DTO with `class-validator` rules"), these routes should
  take a typed DTO so `ValidationPipe` enforces bounds, enum membership and
  rejects unknown fields declaratively and consistently.
- **Risk:** inconsistent validation (a reader can miss a bound a DTO decorator
  would have caught for free), unbounded string fields (no `@MaxLength`)
  reaching the database on 35 routes, and no `forbidNonWhitelisted` 400 to
  surface a client/API contract drift early. Not directly exploitable for
  mass assignment (verified in §3 — no spread reaches Prisma), so this is a
  robustness/consistency gap rather than an active breach.
- **Remediation:** introduce class-validator DTOs for the 35 routes listed in
  Appendix B, matching the pattern already used correctly elsewhere in the
  same modules (e.g. `CreateSupportCaseDto`). Where per-field business rules
  already exist in the reader functions (date ranges, enum sets), those can
  move into custom `@Validate()` decorators rather than being rewritten.
- **Difficulty:** MEDIUM (35 routes, but each DTO is a mechanical translation of an existing reader function)
- **Regression risk:** MEDIUM (any client currently relying on lenient extra-field tolerance will start getting 400s once `forbidNonWhitelisted` applies)
- **Fix now:** LATER

### API-02 — `UpdateSupportCaseDto.tenantId` is a client-settable field spread directly into the Prisma update

- **Category:** Mass Assignment / AuthZ (routed)
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED (code path) / LIKELY (exploitability depends on platform role scoping, which is AUTHZ's area)
- **Known:** NEW
- **Component:** `services/api/src/modules/support-cases/support-cases.service.ts`, `.../dto/support-cases.dto.ts`
- **Evidence:**
  `services/api/src/modules/support-cases/dto/support-cases.dto.ts:84` —
  `@IsOptional() @IsUUID() tenantId?: string;` on `UpdateSupportCaseDto`.
  `services/api/src/modules/support-cases/support-cases.service.ts:337-345` —
  `await tx.supportCase.update({ where: { id }, data: { ...dto, assignedToUserId: dto.assignedToUserId, ... } })`.
  `services/api/src/modules/support-cases/support-cases.controller.ts:31` —
  `@Controller('support-cases') @UseGuards(JwtAuthGuard)` (no `@Permissions`/`@RequirePermission` on the class).
  `services/api/src/modules/support-cases/support-cases.service.ts:220-221` —
  `async get(user, id) { this.assertPlatform(user); ... }`.
- **Current behaviour:** any authenticated caller that passes `assertPlatform`
  (a platform-admin-surface user, not a tenant end-user) can `PATCH` a support
  case and set its `tenantId` to any UUID via the request body; the value
  flows straight from the DTO spread into the Prisma `data` object with no
  existence check beyond whatever FK constraint the database enforces.
- **Expected behaviour:** this may be intentional (a support agent correcting
  which customer a case is filed against — `create()` accepts `tenantId`
  client-side by the same design at line 258) — but there is no visible
  existence/authorization check on the *new* `tenantId` value before the write,
  and no visible role gate distinguishing which platform users may reassign a
  case's tenant versus merely update its status/notes.
- **Risk:** if platform support-desk roles are not uniformly trusted with
  cross-tenant reassignment (i.e. if a "read-only support viewer" role can also
  reach this write), a support case could be silently moved to attach to the
  wrong (or a nonexistent, if FK is nullable) tenant. Does **not** allow a
  tenant end-user to cross tenant boundaries — confirmed via `assertPlatform`.
- **Remediation:** if reassignment is intentional, validate the target
  `tenantId` exists before the update and gate it behind an explicit
  permission separate from "update case status/notes" (AUTHZ to confirm
  whether such separation already exists elsewhere in the platform role
  matrix). If unintentional, drop `tenantId` from `UpdateSupportCaseDto` and
  add a dedicated `reassignTenant` action if the capability is needed.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** NO — route to AUTHZ for the role-scoping determination first.

### API-03 — Two platform-admin list endpoints (`listTenants`, `listAgentAssignments`) have no pagination cap

- **Category:** Performance / Resource Exhaustion (routed to Performance for scoring; noted here for completeness)
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/super-admin/super-admin.service.ts`
- **Evidence:**
  `services/api/src/modules/super-admin/super-admin.service.ts:974-979` —
  `async listTenants() { const tenants = await this.tenantsRepository.findAllForSuperAdmin(); return Promise.all(tenants.map(...)); }`
  — no `take`/`skip`, and an N+1 `Promise.all(.map(async ...))`.
  `services/api/src/modules/super-admin/super-admin.service.ts:990-997` —
  `listAgentAssignments()`: `this.prisma.tenant.findMany({ select: {...}, orderBy: {...} })`, no cap.
- **Current behaviour:** both return every row in the table with no limit.
- **Expected behaviour:** consistent with the other 22 of 24 list endpoints
  in the codebase (§11), these should accept `page`/`pageSize` with a `@Max` cap.
- **Risk:** low today — result size is bounded by "number of DijiPeople
  customers," not by user-generated data, so this is a scalability/cost
  concern for the platform's own growth rather than an attacker-exploitable DoS.
- **Remediation:** add pagination to both, matching `listCustomers()`
  (`platform-lifecycle.service.ts:417`) in the same module, which already does
  this correctly.
- **Difficulty:** LOW
- **Regression risk:** LOW (two admin-only screens)
- **Fix now:** LATER

---

## Healthy — verified good

- **No SQL injection surface.** All 4 raw-SQL sites in the entire API use
  Prisma tagged templates or `Prisma.sql` (auto-parameterized); zero
  `queryRawUnsafe`/`executeRawUnsafe` calls exist anywhere.
  (`services/api/src/common/prisma/prisma.service.ts:139`,
  `services/api/src/modules/outbox/{outbox-dispatcher,outbox}.service.ts`,
  `services/api/src/modules/payroll/payroll.service.ts:443`)
- **No dynamic-field injection via `orderBy`.** All 3 computed-property-key
  `orderBy` sites are allowlisted or sourced from server-side metadata, not
  raw client strings. (`attendance-device.service.ts:77-94`,
  `attendance-integration.service.ts:106-121`, `customization.service.ts:4922`)
- **No `eval`/`new Function`/`child_process` reachable from any request.**
- **Contract/document rendering pipeline is properly defended end-to-end**:
  upload conversion → allowlist HTML sanitization (`cleanContractHtml`,
  `sanitize-html`) → escape-on-substitution placeholder rendering
  (`renderContractPlaceholders`, including table/collection cells and
  signature text) → the only unescaped output is a base64 image data URI
  gated by a strict regex. (`services/api/src/modules/contracts/contracts.service.ts:1272,5256,5428,5628,5635,6150`)
- **Email template rendering escapes every substitution** in HTML mode.
  (`services/api/src/modules/notifications/email/email-template-renderer.service.ts:83-96`)
- **No `.innerHTML =` assignment anywhere** in `apps/web`, `apps/admin`, or
  `apps/landing`; all 6 `dangerouslySetInnerHTML` sites are either static
  strings or trace to the verified-safe contract pipeline.
- **Mass assignment is well-defended.** Zero `...body`/raw-object spreads
  reach a Prisma `create`/`update` call anywhere in the codebase; DTOs are
  consistently mapped field-by-field or through an explicit mapper function
  before reaching Prisma. (22 files audited, §3)
- **CORS is a genuine strict allowlist**, not reflection — confirmed at the
  code level (`buildCorsOptions`, `services/api/src/config/env.validation.ts:115-170`);
  the specific error-amplification bug this design fixed (BUG-0976) is documented in situ.
- **Host-header is never trusted for tenant/routing decisions**, and
  password-reset links are built from server config, not request headers.
  (`services/api/src/modules/tenant-domains/request-hostname.ts`,
  `services/api/src/modules/auth/auth.service.ts:176,450`)
- **Stack traces and raw Prisma error text do not reach clients in
  production** by default (`ERROR_VERBOSE_RESPONSE` defaults false, and even
  when true requires a `system-customizer` role; Prisma errors are mapped to
  catalog-defined generic messages). (`services/api/src/common/filters/http-exception.filter.ts`)
  `render.yaml` does not override the safe default.
- **24 of 24 conventional pagination fields cap page size** (23 via `@Max`,
  1 via a service-layer `Math.min`). (§11)
- **The Stripe webhook is correctly signature-verified, replay-protected, and
  raw-body-correct** — the single highest-stakes item in this whole audit area,
  and it is built right. (`services/api/src/modules/billing/controllers/stripe-webhook.controller.ts`,
  `services/api/src/modules/billing/services/{billing,webhook}.service.ts`)
- **`app-releases/publisher/publish|promote` is not actually unauthenticated**
  despite `@Public()` — a class-level `ReleasePublishTokenGuard` fails closed
  without a configured token, and the deviation is explained in a code comment.
- **No SSRF attack surface exists** — only 2 files make any outbound HTTP call
  at all, both to hardcoded third-party URLs; no "fetch a client-supplied URL"
  capability was found anywhere in the API (logo/avatar, document import,
  domain verification, webhook delivery, OAuth callback — all checked, none exist).
- **Zero duplicate/legacy/debug routes** across all 1273 route decorators;
  zero dangerous-by-name routes without proper guards.

## Not examined / limits

- **`javascript:`-scheme `href`/`src` from user-controlled fields** in
  `apps/web`/`apps/admin` was not separately grepped — out of time budget.
- **The 422-site `findMany` pagination heuristic** (§11) was not individually
  verified beyond the two confirmed findings; most are very likely correct
  (small, tenant-scoped internal lookups) but this was not proven file-by-file.
  Handed to Performance/QA as a worklist, not asserted as a finding.
- **`resolvedHtml`/`runtime-record-page.tsx` and
  `contract-template-editor.tsx`** (§6) were traced to the correct API
  endpoint by name/URL match, not by reading that specific controller handler
  — rated LIKELY rather than CONFIRMED for that reason.
- **Full sensitive-data-exposure sweep** was deliberately not re-done — OBS's
  audit (OBS-07, 24, 25, 26, 30, 31) already covers this area in depth per the
  briefing's explicit instruction not to duplicate it; I contributed one
  narrow supporting negative check (credential fields) and stopped there.
- **CSRF**: not tested against all 719 mutating routes individually for a
  content-type that skips CORS preflight (e.g. `multipart/form-data`) combined
  with a missing `SameSite` cookie in some non-default deployment configuration
  — assessed at the configuration level only (§7).
- **The device/gateway attendance-integration auth model** (59 routes, all
  non-`@Public()`) was confirmed to not be an unauthenticated webhook, but its
  actual credential/API-key mechanism was not audited — that's an AUTHN/AUTHZ question.
- **`.NET gateway` (`gateway/`) and `apps/agent-desktop`** were out of scope
  for this pass entirely — this report covers `services/api` and the three
  Next.js apps only.
- I did not run `npx tsc --noEmit` or any build/test — purely static reading,
  per the briefing's read-only constraint.

---

## Appendix A — Routes by module

| Module | Routes |
|---|---|
| payroll | 92 |
| super-admin | 90 |
| tenant-settings | 71 |
| attendance-integrations | 59 |
| customization | 56 |
| employees | 53 |
| contracts | 41 |
| timesheets | 39 |
| tenant-control-plane | 35 |
| organization | 33 |
| leave | 32 |
| attendance | 31 |
| loans | 31 |
| lookups | 31 |
| notifications | 30 |
| claims | 29 |
| reporting | 28 |
| agent | 26 |
| recruitment | 24 |
| business-trips | 23 |
| users | 23 |
| partner-experience | 22 |
| compensation | 19 |
| tax-rules | 18 |
| billing | 17 |
| projects | 16 |
| benefits | 15 |
| documents | 15 |
| app-releases | 14 |
| auth | 14 |
| platform-runtime | 14 |
| data-management | 13 |
| payslips | 12 |
| support-cases | 12 |
| teams | 12 |
| time-payroll | 12 |
| attendance-engine | 11 |
| onboarding | 11 |
| platform-users | 11 |
| roles | 11 |
| approvals | 10 |
| partners | 10 |
| policies | 9 |
| leads | 8 |
| data | 7 |
| legal | 7 |
| workflows | 7 |
| platform-monitoring | 6 |
| tenants | 6 |
| employee-levels | 5 |
| employment-types | 5 |
| pay-components | 5 |
| settings-runtime | 5 |
| inbox | 4 |
| platform-events | 4 |
| reports | 4 |
| views | 4 |
| demo-data | 3 |
| error-logs | 3 |
| permissions | 3 |
| tenant-domains | 3 |
| root/common | 2 |
| audit | 2 |
| dashboard | 2 |
| navigation | 2 |
| sla | 1 |
| **Total** | **1273** |

(Full method+path+handler+file:line inventory for all 1273 routes was
generated as a working artifact during this audit; not reproduced in full here
for length — available on request via the same extraction method:
route decorator + preceding `@Controller` path, one script pass over every
`*.controller.ts` file.)

## Appendix B — validation-gap routes (§2 full list)

| Method | Path | Handler | File:Line |
|---|---|---|---|
| POST | `/api/data/:entityLogicalName` | `create` | `data.controller.ts:44` |
| PATCH | `/api/data/:entityLogicalName/:recordId` | `update` | `data.controller.ts:54` |
| DELETE | `/api/data/:entityLogicalName` | `deleteMany` | `data.controller.ts:86` |
| POST | `/api/error-logs/client` | `persistClientLog` | `error-logs.controller.ts:25` (KNOWN — OBS-08) |
| PATCH | `/api/inbox/:id` | `updateStatus` | `inbox.controller.ts:52` |
| POST | `/api/configuration/currencies` | `createCurrency` | `configuration.controller.ts:59` |
| PATCH | `/api/configuration/currencies/:id/manual-override` | `updateCurrencyManualOverride` | `configuration.controller.ts:108` |
| PATCH | `/api/configuration/currencies/:id` | `updateCurrency` | `configuration.controller.ts:135` |
| POST | `/api/lookups/states` | `createState` | `lookups.controller.ts:66` |
| PATCH | `/api/lookups/states/:id` | `updateState` | `lookups.controller.ts:96` |
| POST | `/api/lookups/cities` | `createCity` | `lookups.controller.ts:127` |
| PATCH | `/api/lookups/cities/:id` | `updateCity` | `lookups.controller.ts:157` |
| DELETE | `/api/onboarding` | `deleteMany` | `onboarding.controller.ts:89` |
| POST | `/api/payroll/runs/:runId/journal/reverse` | `reverseJournal` | `payroll-gl.controller.ts:247` |
| POST | `/api/payroll/operations/runs/:id/payment-batches/:exportId/import-results` | `importPaymentResults` | `payroll-operations.controller.ts:234` |
| POST | `/api/payroll/operations/.../import-results/preview` | `previewPaymentResults` | `payroll-operations.controller.ts:248` |
| POST | `/api/payroll/operations/runs/:id/payment-batches/:exportId/retry-failed` | `retryFailedPayments` | `payroll-operations.controller.ts:268` |
| POST | `/api/payroll/operations/runs/:id/payment-lines/:lineId/reconcile` | `reconcilePaymentLine` | `payroll-operations.controller.ts:298` |
| PATCH | `/api/platform/logs/events/:traceId` | `updateEvent` | `platform-monitoring.controller.ts:47` |
| DELETE | `/api/candidates` | `deleteMany` | `candidates.controller.ts:122` |
| POST | `/api/holiday-calendars` | `createHolidayCalendar` | `enterprise-configuration.controller.ts:45` |
| PATCH | `/api/holiday-calendars/:id` | `updateHolidayCalendar` | `enterprise-configuration.controller.ts:71` |
| POST | `/api/holiday-calendars/:id/holidays` | `createHoliday` | `enterprise-configuration.controller.ts:111` |
| PATCH | `/api/holiday-calendars/:id/holidays/:holidayId` | `updateHoliday` | `enterprise-configuration.controller.ts:122` |
| POST | `/api/holiday-calendars/:id/assignments` | `assignHolidayCalendar` | `enterprise-configuration.controller.ts:154` |
| POST | `/api/work-schedules` | `createWorkSchedule` | `enterprise-configuration.controller.ts:182` |
| PATCH | `/api/work-schedules/:id` | `updateWorkSchedule` | `enterprise-configuration.controller.ts:205` |
| POST | `/api/shift-templates` | `createShiftTemplate` | `enterprise-configuration.controller.ts:239` |
| PATCH | `/api/shift-templates/:id` | `updateShiftTemplate` | `enterprise-configuration.controller.ts:262` |
| POST | `/api/employee-schedule-assignments` | `createEmployeeScheduleAssignment` | `enterprise-configuration.controller.ts:296` |
| POST | `/api/payroll-regions` | `createPayrollRegion` | `enterprise-configuration.controller.ts:351` |
| PATCH | `/api/payroll-regions/:id` | `updatePayrollRegion` | `enterprise-configuration.controller.ts:377` |
| POST | `/api/fiscal-years` | `createFiscalYear` | `enterprise-configuration.controller.ts:415` |
| PATCH | `/api/fiscal-years/:id` | `updateFiscalYear` | `enterprise-configuration.controller.ts:448` |
| POST | `/api/field-security-policies` | `create` | `field-security.controller.ts:184` |
| PATCH | `/api/field-security-policies/:policyId` | `update` | `field-security.controller.ts:224` |
| POST | `/api/field-security-policies/:policyId/rules` | `addRule` | `field-security.controller.ts:303` |
| PATCH | `/api/field-security-policies/:policyId/rules/:ruleId` | `updateRule` | `field-security.controller.ts:365` |
