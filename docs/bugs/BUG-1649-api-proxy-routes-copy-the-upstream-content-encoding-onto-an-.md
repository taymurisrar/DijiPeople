---
ID: BUG-1649
aliases: [BUG-1649]
Title: API proxy routes copy the upstream Content-Encoding onto an already-decompressed body
Status: OPEN
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-27
DetectedInSha: 21032ae
AffectedModules: [settings-runtime, tenant-settings]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-27
UpdatedAt: 2026-08-27
ResolvedAt:
---

# BUG-1649 — API proxy routes copy the upstream Content-Encoding onto an already-decompressed body

> **Architect triage, 2026-08-27 — `FIX_NOW`.** It is the first screen a new customer sees, the message it shows is false, and the fix is deleting two headers in a shared helper. Grouped with [[BUG-1644]]: both block the same journey and both were found in the first minute of using the login UI.


## Summary

Nine Next.js proxy routes forward the upstream response's headers verbatim onto
a body `fetch` has already decompressed. The response therefore claims
`Content-Encoding: br` while carrying plain JSON, and the browser fails to decode
it. On the tenant workspace this surfaces as a blocking **"Server unavailable"**
dialog on the first screen a new customer ever sees.

## Expected Behavior

A proxy that returns a decompressed body does not advertise a content encoding it
did not apply. The client reads the JSON.

## Actual Behavior

`net::ERR_CONTENT_DECODING_FAILED`, then a modal reading
"Error NETWORK_ERROR — Server unavailable. The server could not be reached. Try
again shortly." The server was reached and answered correctly.

## Reproduction

1. Sign in to a tenant workspace and land on the overview.
2. Observe the error dialog and, in the console,
   `ERR_CONTENT_DECODING_FAILED` for `/api/settings/resolved-context`.

Without a browser:

```
curl -s -i -H 'Accept-Encoding: identity' \
  https://<slug>.ws.dijipeople.com/api/settings/resolved-context
```

## Evidence

Observed on production 2026-08-27, tenant `dijipeople-demo`, immediately after
the owner's first sign-in.

The response headers and body disagree:

```
HTTP/1.1 401 Unauthorized
Content-Encoding: br
Content-Length: 292
Content-Type: application/json; charset=utf-8
```

The 292 bytes on the wire begin:

```
{"success":false,"traceId":"web_ca9fbed4-4843-42…
```

Plain JSON, declared as Brotli. Note the header is returned even when the
request asks for `Accept-Encoding: identity`, which is a protocol violation in
its own right.

Console at the moment the dialog appeared:

```
[ERROR] Failed to load resource: net::ERR_CONTENT_DECODING_FAILED
        @ /api/settings/resolved-context
TypeError: Failed to fetch
```

## Root Cause

Established. `apps/web/app/api/settings/resolved-context/route.ts`:

```ts
const response = await apiRequest(`/settings/resolved-context…`, { method: "GET" });

return new NextResponse(response.body, {
  status: response.status,
  headers: response.headers,   // <- upstream Content-Encoding comes with it
});
```

`fetch` transparently decompresses the upstream body, but `response.headers`
still describes the *compressed* upstream response — both `Content-Encoding` and
a `Content-Length` measured before decompression. Copying the whole header set
onto the decoded body produces a response that lies about itself.

**Nine routes share the pattern**, so this is not one screen:

```
apps/web/app/api/agent/dlp/[...path]/route.ts
apps/web/app/api/app-releases/[...path]/route.ts
apps/web/app/api/customers/route.ts
apps/web/app/api/customers/[customerId]/route.ts
apps/web/app/api/projects/[projectId]/resources/route.ts
apps/web/app/api/projects/[projectId]/timesheets/route.ts
apps/web/app/api/settings/my-preferences/route.ts
apps/web/app/api/settings/resolved-context/route.ts
apps/admin/app/api/support-cases/[[...path]]/route.ts
```

## Impact

The first screen of a newly provisioned workspace greets its owner with a modal
saying the server cannot be reached. It can — it answered in full. The message is
not merely unhelpful, it is false, and it points an operator at infrastructure
when the fault is a header.

**It also blocks the page beneath it.** Established 2026-08-27 while trying to
create the first employee: the click on "New" failed, and Playwright reported

```
<div role="presentation" class="fixed inset-0 z-[110] … bg-black/40 …">
intercepts pointer events
```

The dialog is a modal overlay covering the viewport, so nothing on the page can
be clicked until it is dismissed — and it returns on every navigation, because
`/api/settings/resolved-context` is fetched on each page. Dismissing it let the
same click through immediately.

So the sequence a new customer meets is: sign in, read that the server is
unavailable, find the page inert, and dismiss a dialog on every screen they
open. Each of those is false or unnecessary. The workspace is healthy
throughout.

Customers, projects, timesheets, saved preferences, DLP capture review and admin
support cases all route through the same pattern, so the failure is not confined
to settings. Whether each one surfaces depends on how its caller handles a failed
decode.

Nothing is lost or corrupted, and the API is healthy throughout, which is why
this is HIGH rather than CRITICAL. It is a presentation of failure where there is
none.

## Affected Areas

The nine routes listed above, plus `apps/web/lib/server-api.ts` and the admin
equivalent, which are the natural home for a shared fix. `AGENTS.md` already
describes these routes as "thin proxies".

## Proposed Resolution

Strip the hop-by-hop and body-describing headers when forwarding. At minimum
`content-encoding` and `content-length`; `transfer-encoding` and `connection`
belong in the same set.

Fix it once, in the shared proxy helper, rather than nine times — the nine
identical call sites are the reason this reached production, and leaving the
pattern in place invites a tenth. A small `forwardResponse(response)` helper that
returns a `NextResponse` with a sanitised header set would make the correct thing
the easy thing.

Consider also whether these routes need to forward upstream headers at all.
Several of them only ever return JSON.

## Acceptance Criteria

- `/api/settings/resolved-context` returns a body whose declared encoding matches
  its bytes, for both success and error responses.
- The tenant workspace overview loads with no error dialog and no console error.
- No modal overlay intercepts pointer events on a healthy page load.
- A request with `Accept-Encoding: identity` receives an unencoded response.
- All nine routes are covered by whatever shared helper is introduced.

## Regression Coverage

None yet. Needs a test asserting a proxied error response carries no
`content-encoding` header, exercised through at least one of the nine routes.
Requires a `REG-nnn` entry once written.

## Dependencies

None.

## Related Items

Found during the first browser-driven sign-in to a tenant workspace, in the same
pass as [[BUG-1644]]. Both were invisible to API-level testing: this one needs a
browser to decode the response, and that one needs a browser to follow the
redirect.

## Resolution

Not yet resolved.

## QA Retest

Not yet retested. Retest in a browser — `curl` reports the mismatched header but
will happily hand back the body, so a command-line check can look like a pass.

## History

- 2026-08-27 — found on the first screen of a newly provisioned tenant workspace,
  during the first sign-in ever performed through the login UI.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[settings]]

<!-- GRAPH:END -->
