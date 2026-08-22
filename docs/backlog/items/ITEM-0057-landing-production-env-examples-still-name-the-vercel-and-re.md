---
ID: ITEM-0057
aliases: [ITEM-0057]
Title: Landing production env examples still name the vercel and render hosts, not the dijipeople.com apex
Type: PRODUCT_DECISION
Status: DONE
Priority: P2
Severity:
AffectedModules: [apps/landing]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-08-19
UpdatedAt: 2026-08-22
RelatedBug: BUG-0714
RelatedQA:
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0057 — Landing production env examples still name the vercel and render hosts, not the dijipeople.com apex

## Summary

Uncommitted edits to the three `apps/landing` env examples were found in the
primary worktree while resolving [[BUG-0076]]. They move the landing app's
production URLs from the deployed `diji-people-*.vercel.app` /
`dijipeople.onrender.com` hosts onto a `dijipeople.com` apex, and add
`NEXT_PUBLIC_TENANT_ROOT_DOMAIN`.

The intent is real and worth deciding on. The edits as written are not safe to
commit, so they were preserved verbatim on the branch
`preserve/landing-env-domain-cutover` (`2472df3`) and the tracked files were
restored. **Nothing was discarded.**

## Why It Matters

`packages/config/platform-domains.js` already defaults `PUBLIC_BASE_DOMAIN` to
`dijipeople.com` in production, and `app.dijipeople.com` appears in the Stripe
return URLs. The platform is part-way onto the apex while every deployment
example still names the preview hosts. Leaving the two halves inconsistent is
how [[BUG-0026]] happened — production builds emitting URLs that resolve
nowhere.

The cost of not deciding is that the next person to copy an example file gets a
configuration that contradicts `docs/environment-variables.md`, and the drift
recurs the next time somebody hand-edits their local copy.

## Evidence

Preserved content: `preserve/landing-env-domain-cutover` @ `2472df3`.

What the working-copy edits did, against `aa33524`:

- `apps/landing/.env.production.example` — `NEXT_PUBLIC_APP_ORIGIN`,
  `*_APP_URL`, `NEXT_PUBLIC_API_BASE_URL`, `API_BASE_URL` and `API_ORIGIN` moved
  to `dijipeople.com` / `api.dijipeople.com` / `admin.dijipeople.com`.
- Deleted the two-line comment added by `5b602be`, which documents that
  `APP_ENV` arms the production URL validation in `packages/config`. That
  comment is the regression guard for [[BUG-0026]].
- Added `NEXT_PUBLIC_TENANT_ROOT_DOMAIN` to all three files.
  `docs/environment-variables.md:83` documents it as a **legacy alias** for
  `TENANT_BASE_DOMAIN`, and `git grep` shows it is read only by
  `apps/admin/lib/tenant-url.ts` and `packages/config/platform-domains.js:166` —
  `apps/landing` does not read it at all.
- Overwrote `.env.local.example` with content byte-identical to `.env.example`
  (both 430 bytes, blob `c9415cd`), collapsing two files that serve different
  purposes.
- Removed the trailing newline from all three.

Contradicted by, at `494c44d`: the root `.env.production.example`,
`apps/web/.env.production.example`, the API section of
`docs/environment-variables.md`, and the `CORS_ALLOWED_ORIGINS` the API is
deployed with — all of which still name the vercel and render hosts.

## Proposed Approach

A product decision first, then one task — not an ExecPlan.

1. Decide whether `dijipeople.com` is live for the landing, web, admin and API
   hosts, or still aspirational.
2. If live: change **every** example and the deployment documentation together,
   including `CORS_ALLOWED_ORIGINS`, the Stripe URLs and `render.yaml`. Keep the
   `APP_ENV` comment. Use `NEXT_PUBLIC_TENANT_BASE_DOMAIN`, not the legacy
   alias, and only where the app actually reads it.
3. If aspirational: leave the examples as they are and close this item with the
   reason recorded.

Either way, restore `.env.local.example` as a distinct file rather than a copy
of `.env.example`.

## Acceptance Criteria

- No example file names a host that contradicts `docs/environment-variables.md`.
- `apps/landing/.env.local.example` differs from `apps/landing/.env.example`.
- The `APP_ENV` explanatory comment survives.
- No env var is added to an app that does not read it.
- Every tracked example file ends with a newline.

## Dependencies

DNS, TLS and proxy routing for the apex must actually be live before the
production values change — see the wildcard-DNS readiness note in
`docs/environment-variables.md`.

## Related Items

[[BUG-0076]] — the repository-health defect that surfaced these files.
[[BUG-0026]] — the localhost-URL regression the deleted comment guards.
[[ITEM-0058]] — the other generated-drift file found in the same dirty state.
[[SESSION-0017]].

## Resolution — 2026-08-22, SESSION-0040

**The user confirmed `dijipeople.com` is live, and production agrees** — checked
rather than taken on trust:

| Host | Response |
|---|---|
| `www.dijipeople.com` | 200 |
| `app.dijipeople.com` | 307 to login |
| `admin.dijipeople.com` | 307 |
| `api.dijipeople.com/api/health` | 200, `environment: production` |

71 references updated across the four `.env.production.example` files,
`docs/environment-variables.md` and `docs/deployment-env-checklist.md`.
`CORS_ALLOWED_ORIGINS` in the checklist is now the value **read from the live
Render service**, including the bare apex alongside `www` — both resolve, and a
browser sends whichever the customer typed.

Bug and QA records were deliberately **not** rewritten. A record saying the value
was the Vercel host on a given day is telling the truth about that day; editing
it would be rewriting history to make the present look tidy.

### What this item did not fix, and could not

The examples were never the live configuration. Reading the live one is what
turned this from a documentation chore into [[BUG-0714]]:

- `WEB_APP_URL = https://diji-people-web.vercel.app` — every activation,
  invitation and password-reset link the API mails to a customer points at the
  Vercel host.
- `API_BASE_URL = http://api.dijipeople.com/api` — plain HTTP, while
  `API_ORIGIN` beside it is correctly HTTPS.
- `WEB_APP_PROD_ROOT_DOMAIN` and `NEXT_PUBLIC_WEB_ROOT_DOMAIN` unset, so the
  per-tenant subdomain rewrite in `tenant-url.config.ts` never fires even though
  `TENANT_BASE_DOMAIN = ws.dijipeople.com` is set.

Those are production environment writes and need the user’s approval, so they
are [[BUG-0714]] rather than part of this item.

### The underlying defect worth fixing

Two variables name one concept: `TENANT_BASE_DOMAIN` (read by the hostname
issuer) and `WEB_APP_PROD_ROOT_DOMAIN` (read by the URL builder). Setting one
and not the other is not an error today, which is exactly how production ended
up half-configured. Collapsing them is carried by [[BUG-0714]].

## History

- 2026-08-19 — created at `494c44d`, from working-copy state preserved at
  `2472df3`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-0714]]
- Referenced by — [[BUG-0076]]
- Modules — [[landing-architecture]]

<!-- GRAPH:END -->

- 2026-08-22 — user confirmed the apex is live. Examples and checklist updated to the customer domains; reading the live configuration surfaced BUG-0714.
