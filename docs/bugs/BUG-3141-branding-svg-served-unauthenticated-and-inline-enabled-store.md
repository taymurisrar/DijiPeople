---
ID: BUG-3141
aliases: [BUG-3141]
Title: Branding SVG served unauthenticated and inline enabled stored XSS on the API origin
Status: OPEN
Severity: HIGH
Priority: P1
Type: SECURITY
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: a800d8f2
AffectedModules: [services/api/src/modules/customization]
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

# BUG-3141 — Branding SVG served unauthenticated and inline enabled stored XSS on the API origin

## Summary

Branding SVG served unauthenticated and inline enabled stored XSS on the API origin

Identified by the 2026-09-10 full technical audit as AUTH-06 / FILE-02 (confidence: AUTH-06=CONFIRMED (each primitive verified; the final step needs a platform admin to open the asset URL), FILE-02=CONFIRMED).

## Expected Behavior

**AUTH-06:** User-supplied SVG is either rejected, sanitised, or served from a separate sandbox origin with `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` and a restrictive CSP.

**FILE-02:** Reject image/svg+xml for branding, or sanitise it and serve it as Content-Type: image/svg+xml; Content-Security-Policy: sandbox with Content-Disposition: attachment. The public asset route should additionally refuse a slug that does not match the requesting workspace host.

## Actual Behavior

**AUTH-06:** Any tenant administrator can upload an SVG containing `<script>` as their workspace logo, favicon or login image. It is then served from `https://api.dijipeople.com/api/public/tenants/<slug>/assets/logo` as `Content-Type: image/svg+xml`, `Content-Disposition: inline`, with no CSP and no nosniff. A browser navigating to that URL executes the script **in the `api.dijipeople.com` origin**.

**FILE-02:** Two separate problems in one endpoint. 1. Cross-tenant read by design. GET /api/public/tenants/<slug>/assets/logo serves tenant A's uploaded file to anyone on the internet, and the tenant app proxy will serve tenant A's asset from tenant B's hostname. There is no host↔slug check anywhere in the chain. 2. Stored XSS. A tenant administrator uploads logo.png whose multipart Content-Type is image/svg+xml (the extension allowlist checks the filename, the MIME allowlist checks the declared header, and they are checked independently — see FILE-06). It is stored with mimeType = image/svg+xml and served inline with that type. Navigating to https://<tenantB>.<domain>/api/public/tenants/<tenantA>/assets/logo executes the attacker's script on tenant B's origin, where the session cookie is scoped (AUTH_COOKIE_DOMAIN is set on the live service) and every app/api/* proxy attaches it server-side. The script cannot read the httpOnly cookie but can issue same-origin authenticated requests through those proxies and exfiltrate the response.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior. Multiple audit findings are consolidated into this record; each is independently traceable at its own citation.

## Evidence

**AUTH-06** (services/api/src/modules/tenant-settings/branding-assets.service.ts, services/api/src/modules/tenants/public-tenants.controller.ts, services/api/src/main.ts):

`services/api/src/modules/tenant-settings/branding-assets.service.ts:50` — SVG is on the tenant-facing upload allowlist:
```ts
const IMAGE_MIME_TYPES = [
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml',
];
```
`services/api/src/modules/tenants/public-tenants.service.ts:196` — the serving guard admits it, because SVG starts with `image/`:
```ts
    if (!document?.storageKey ||
        !document.mimeType?.toLowerCase().startsWith('image/')) {
```
`services/api/src/modules/tenants/public-tenants.controller.ts:54` — served inline with the stored content type, from the API origin, unauthenticated (`@Public()`):
```ts
    response.setHeader('Content-Type', asset.document.mimeType ?? 'application/octet-stream');
    response.setHeader('Content-Disposition', `inline; filename="${asset.document.originalFileName}"`);
```
`services/api/src/main.ts` — no `helmet`, no `Content-Security-Policy`, no `X-Content-Type-Options`. Grep for all three over `services/api/src` returns zero matches. Confirmed live: the production response headers captured for AUTH-07 contain no `content-security-policy` and no `x-content-type-options`.
Cookie scope confirmed in production (see AUTH-07): `admin_access_token=…; Domain=.dijipeople.com; … SameSite=Lax`.

---

**FILE-02** (services/api/src/modules/tenants/public-tenants.controller.ts, apps/web/app/api/public/tenants/[tenantSlug]/assets/[assetType]/route.ts, services/api/src/modules/tenant-settings/branding-assets.service.ts):

The route is @Public() and takes the tenant slug from the path:
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

The only content check is a prefix match, which image/svg+xml passes:
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

The tenant app proxies it from its own origin with the slug passed through and no check that the slug matches the host:
```
apps/web/app/api/public/tenants/[tenantSlug]/assets/[assetType]/route.ts:28-37
  const response = await apiRequest(
    `/public/tenants/${encodeURIComponent(tenantSlug)}/assets/${encodeURIComponent(assetType)}`,
    { includeAuth: false },
  );
  ...
  return proxyApiFileResponse(response);
```
and proxyApiFileResponse forwards content-type and content-disposition verbatim (apps/web/lib/server-api.ts:486-487).

The API's CSP is Report-Only, so it blocks nothing (packages/config/security-headers.js:98-116, and the apps/web header set ships Content-Security-Policy-Report-Only at line 168-171). nosniff does not help: image/svg+xml is the correct type for the bytes, and browsers execute script in an SVG document navigated to directly.

Verified reachable in production (unauthenticated, returns 404/400 rather than 401):
```
GET https://dijipeople.onrender.com/api/public/tenants/demo/assets/logo  -> HTTP/1.1 404
```

---


Full finding text: AUTH-06 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTH.md`; FILE-02 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/FILE.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

**AUTH-06:** Script running on `api.dijipeople.com` is same-origin with the entire API. It does not need to read the `HttpOnly` admin cookie — it only needs to ride it: `fetch('/api/super-admin/tenants', { credentials: 'include' })` succeeds and the response is readable. A platform administrator who opens a tenant's logo URL (from the tenant record, from a support ticket, from a rendering issue report) hands the tenant full platform-admin API access across every customer. The same primitive works against tenant users on the `SameSite=Lax` web cookie.

**FILE-02:** Session-riding account takeover of any user of any tenant, delivered by a link. The attacker only needs one tenant account with branding-settings access — which a trial/self-serve signup grants.

## Affected Areas

services/api/src/modules/customization

## Proposed Resolution

**AUTH-06:** Drop `'image/svg+xml'` from `IMAGE_MIME_TYPES` and `FAVICON_MIME_TYPES` in `branding-assets.service.ts`; rasterise or sanitise if SVG must stay. Independently, add `helmet()` in `main.ts` with `X-Content-Type-Options: nosniff` and a `default-src 'none'` CSP on the asset route, and change `Content-Disposition` to `attachment` for anything not on a rasterised-image allowlist. (Difficulty: LOW; Regression risk: LOW (tenants with an existing SVG logo need to re-upload; detectable with one query); Fix now: YES — and route the upload half to the file-upload specialist.)

**FILE-02:** Drop image/svg+xml from IMAGE_MIME_TYPES and FAVICON_MIME_TYPES in branding-assets.service.ts, and from ALLOWED_DOCUMENT_MIME_TYPES in documents.service.ts:41-50. Force Content-Disposition: attachment on every non-image-raster type, and add X-Content-Type-Options: nosniff to the API's own responses. Add a host↔slug assertion in apps/web/app/api/public/tenants/[tenantSlug]/assets/[assetType]/route.ts. (Difficulty: LOW; Regression risk: LOW — an existing SVG logo would need re-upload as PNG; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/src/modules/tenant-settings/branding-assets.service.ts, services/api/src/modules/tenants/public-tenants.controller.ts, services/api/src/main.ts (audit id AUTH-06).
- The behaviour described in Expected Behavior holds for services/api/src/modules/tenants/public-tenants.controller.ts, apps/web/app/api/public/tenants/[tenantSlug]/assets/[assetType]/route.ts, services/api/src/modules/tenant-settings/branding-assets.service.ts (audit id FILE-02).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: AUTH-06=LOW (tenants with an existing SVG logo need to re-upload; detectable with one query), FILE-02=LOW — an existing SVG logo would need re-upload as PNG. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `AUTH-06` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/AUTH.md`
- Audit finding `FILE-02` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/FILE.md`

## Resolution

SVG removed from the accepted branding-asset MIME types and the branding pipeline hardened as part of the durable-storage rework (commit f4278f17, "feat(storage): durable object storage on Cloudflare R2 (FILE-01/INF-05)", which lists FILE-02 explicitly, plus the follow-up commit 8631a133, "chore(storage): close the SVG branding hole at both ends"). Not yet independently QA-retested against the live branding upload path from the AUTH-06 angle (crafted logo link served from the API origin on the shared cookie domain) — only re-verify before moving this to VERIFIED.

## QA Retest

Not yet retested against production. Confirm: (1) uploading an SVG as a branding asset is refused, (2) any pre-existing SVG branding asset no longer serves inline / with an executable content type on the API origin.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (AUTH-06, FILE-02) at `a800d8f2`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
