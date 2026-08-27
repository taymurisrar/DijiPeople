# Handoff — Browser QA after the 2026-08-28 release

> Written 2026-08-28, continuing
> [`2026-08-27-tenant-workspace-browser-qa.md`](2026-08-27-tenant-workspace-browser-qa.md).
> Everything stated as fact below was observed against **production**. Where
> something is inferred, it says so.
>
> **The headline: eight defects shipped to production as `e0aeabcd`, and none of
> them has been retested in a browser.** They were proven by unit tests and
> mutation tests, then deployed. That is not the same as working. Your first job
> is to find out which of them actually behave, because a fix that passes its own
> test and fails in the product is worse than an open bug — it is an open bug
> that nobody is looking for any more.

---

## 1. Read this before you start the browser

Drive the product with the **`@playwright/mcp` browser**. The rubric and the
evidence rules are in
[`docs/development/browser-control.md`](../development/browser-control.md) —
§9, §10 and §14 are the parts to follow rather than skim.

### Six things that will waste your time if you do not know them

1. **Confirm the allowlist actually loaded.** `.mcp.json` is read **only at MCP
   server start**. Call `browser_get_config` and read `network.allowedOrigins`
   back before concluding a host is blocked. It currently should contain the
   four product origins, `https://*.ws.dijipeople.com`, and the Stripe origins
   the owner added on 2026-08-27 (`checkout.stripe.com`, `js.stripe.com`,
   `m.stripe.network`, `api.stripe.com`).
2. **`curl -w` is broken here.** It returns `curl: (43) A libcurl function was
   given a bad argument` and HTTP `000` for *any* method and *any* URL,
   including ones that work. A previous session concluded the sandbox blocked
   `DELETE`; it does not. I repeated the mistake on 2026-08-28 and briefly
   believed `/api/health` was unreachable. Use `curl -i | head -1`.
3. **Playwright MCP writes into the repository.** It refuses scratchpad paths,
   so screenshots, snapshots and console logs land in `.playwright-mcp/` inside
   the user's primary checkout and show up in their GitHub Desktop. Delete the
   directory before you finish. Do not commit it.
4. **The browser profile is single-instance.** A second session holding it
   gives `Browser is already in use`. Check before assuming breakage.
5. **Verify a tenant by its name, never by its colours.** A workspace subdomain
   that resolves to *no tenant at all* still renders a branded-looking login
   using platform defaults. On 2026-08-28 I read an emerald palette as proof
   that tenant resolution worked. It was not: that host was a slug I had
   invented, and the palette was the default. Judge by the tenant's name in the
   `h1`, or by `GET /api/public/tenants/resolve`.
6. **Invented test data produces real-looking failures.** The same mistake gave
   me a `404` from `/api/public/tenants/resolve?slug=maseer` that I nearly filed
   as a defect. `maseer` is a *fixture in a unit test*
   (`apps/web/lib/workspace-routing.spec.ts`), not a tenant. Get slugs from
   `/api/public/tenants/resolve` or the admin console, never from memory.

---

## 2. Access

**Platform admin** — `admin.dijipeople.com`, `test@dijipeople.com`, password
`helloworld`. `PLATFORM_OWNER`. Sessions expire after ~30 minutes.

**Tenant workspace** — `qa-e2e-signup-b-20260826.ws.dijipeople.com`,
`TEN-000001`, status `ACTIVE`, display name "QA E2E Signup B 20260826". It was
created by a real paid signup and **still exists as of 2026-08-28**, despite the
previous handoff saying it would be erased. Confirm it is still there before
planning around it; if it is gone, run a paid signup on `www.dijipeople.com`.

The owner's password was shared in chat and is deliberately in no file.
**Credentials never go in a record** — `docs/bugs/README.md` and
[`.agent/agents/qa.md`](../../.agent/agents/qa.md). Ask the owner for it, and
keep whatever you use out of every commit.

**API** — `POST /api/admin/auth/login` for platform; `POST /api/auth/login` with
`X-DijiPeople-App: web` for tenant. Useful for reading field values the UI does
not render. **Not a substitute for driving the screen** — see §7.

---

## 3. What shipped, and what is deployed

Production is `e0aeabcd` (merged from `develop` via PR #53). Verified live on
all four surfaces: the API reports the commit at
`https://api.dijipeople.com/api/health`, and web, admin and landing are all
`READY` on that SHA in Vercel.

Two further commits — `37a0db54` (BUG-1644 closure, REG-271, ITEM-0103) and the
one carrying this handoff — passed CI and were integrated into `develop`
afterwards. They are records and one web unit test; **no runtime behaviour
changes with them**, so `e0aeabcd` remains what production is running unless
someone has promoted `develop` since.

Confirm rather than assume, both of them:

```bash
git log --oneline origin/main -3
curl -s https://api.dijipeople.com/api/health   # commitShort is the truth
```

A merge to `main` is not a deploy. One sat undeployed here for 48 minutes with
no error shown anywhere.

---

## 4. Retest these first — fixed, deployed, never seen working

This is the core of the pass. Each shipped in `e0aeabcd` with a regression test
and a mutation test, and each is `Status: FIXED` rather than `VERIFIED` because
no human or browser has confirmed it in the product. Every one has a reusable scenario — run it rather than improvising.

| Bug | Sev | Scenario | What to actually do |
|---|---|---|---|
| BUG-1649 | HIGH | QA-TENANT-018 | Load several tenant list screens and record pages. The defect was proxy routes copying upstream `Content-Encoding` onto an already-decompressed body, which blocked whole pages. Watch the network panel for content-encoding errors, not just for a rendered page. |
| BUG-1516 | HIGH | QA-TENANT-020 | Run a **fresh paid signup** and confirm exactly one `CustomerAccount` results. This is the one that needs a new signup to test at all; everything else can use the existing tenant. |
| BUG-1578 | HIGH | QA-TENANT-021 | Admin → Customers → create, set Country, save, then read the record **through the API** and confirm `country` holds a name and not a UUID. The screen renders both identically — that is why it survived. Then generate an agreement and check the registered address. |
| BUG-1541 | HIGH | QA-TENANT-022 | Admin → create an agreement from a **customer** using a tenant-provisioning template. Expect refusal with `CONTRACT_SOURCE_CANNOT_FILL_TEMPLATE`. Then repeat from a **tenant** and expect success. Read `GET /api/contracts/{id}/document-fields` as well as the rendered document. |
| BUG-1419 | HIGH | QA-TENANT-023 | Admin → Settings → Monitoring → click an incident title. Expect the queue filtered by reference number, not a 404. |
| BUG-1420 | HIGH | QA-TENANT-024 | Same screen, Critical view. Compare its count against a direct query for errors regardless of case. **They should now agree.** |
| BUG-1654 | MED | QA-TENANT-019 | Open any empty list in a workspace with no filters set. It must say "No records yet", not blame filters. |
| BUG-1644 | CRIT | QA-AUTH-006 | Already verified 2026-08-28 — listed so you know it is done, not to redo. |

Six older records are also `FIXED` and unverified, from earlier sessions.
Three have a browser surface and are worth a pass once §4 is done: **BUG-0900**
(provisioning exceeded the 5s transaction timeout, leaving a paid order with no
workspace), **BUG-1128** (Stripe API version skew on `invoice.paid`) and
**BUG-1422** (runtime form validation discarded every field reason and showed
"Bad Request Exception"). BUG-1422 is the cheapest to check — submit any runtime
form with an invalid field and read what the user is told.

The other three — BUG-1203, BUG-1208, BUG-1494 — are tooling and repo-health
defects with no browser surface at all. Leave them.

---

## 5. Needs the owner, not QA

None of these can be closed by testing or by code. Raise them; do not sink time
into them.

**BUG-1544 — landing advertises a workspace domain that does not resolve.**
Still open, and I confirmed the cause on 2026-08-28: the Vercel **landing**
project has *no* tenant-domain variable at all. Its eight variables are
`NODE_ENV`, `APP_ENV`, `NEXT_PUBLIC_LANDING_URL`, `NEXT_PUBLIC_API_BASE_URL`,
`API_BASE_URL`, `API_ORIGIN`, `NEXT_PUBLIC_WEB_URL`, `NEXT_PUBLIC_ADMIN_URL`.
With none of `TENANT_BASE_DOMAIN` / `NEXT_PUBLIC_TENANT_BASE_DOMAIN` set,
`packages/config/platform-domains.js` falls back to the apex, so step 2 of
`/subscribe` offers `<slug>.dijipeople.com` — a host that does not resolve.
**Fix: set `NEXT_PUBLIC_TENANT_BASE_DOMAIN=ws.dijipeople.com` on the landing
project and redeploy it.** I did not verify the rendered step-2 string, because
it is client-rendered and reaching it needs a signup — **verify it in the
browser before and after**, since the value is inlined at build time.

**Four go-live records may be stale — revalidate before trusting them.**
BUG-0898 (no plan price synced to Stripe), BUG-0903 (Stripe in test mode),
BUG-0904 (`OUTBOX_WORKER_ENABLED` missing, so no workspace is provisioned after
payment) and BUG-0905 (`DIRECT_URL` vs `DIRECT_DATABASE_URL`) are all still
`OPEN` / `BLOCKED_EXTERNAL`. But a **real paid signup completed and provisioned
`TEN-000001` end to end** on 2026-08-26. That directly contradicts BUG-0904 as
written, and sits awkwardly with BUG-0898 and BUG-0903. Establish what is
actually true now rather than repeating the records — and if they are stale,
that itself is a finding worth recording.

---

## 6. Open, and not QA's to decide

`PLAN_REQUIRED` — do not fix these in passing:
BUG-0015 (a tenant failing before identities-and-billing is unrecoverable),
BUG-0016 (partner onboarding has no state machine),
BUG-1423 (runtime form controls have no accessible name — screen readers
announce every field as blank),
BUG-1424 (admin serves no CSP header),
BUG-1545 (manual customer onboarding fails on an owner foreign key).

`ITEM-0103` — a deployment check that fails when the composed tenant workspace
host does not resolve. This is the guard that would have caught BUG-1644 before
a customer did, and no repository test can substitute: the value under test is
not in the repository.

**BUG-1555 is open on purpose.** An inactive plan with no prices is offered as a
customer preferred plan. It was attempted and stopped: `/super-admin/plans` is
shared with a screen that must show inactive plans, and a picker-only filter is
a read filter over a write path that still accepts any plan id — the exact shape
that already bit this repository on `/public/plans`. Both halves are small;
together they are a design decision. The reasoning is in the record.

**BUG-1420 is fixed but the data is not normalised.** 1,466 rows still hold
lowercase severity. The filter now sees them; the storage is still inconsistent.
That needs a migration and a plan.

---

## 7. Dead ends — do not repeat these

- **Do not conclude a fix works because its unit test passes.** That is what the
  whole of §4 exists to correct.
- **Do not read a running frontend bundle as evidence about current
  configuration.** `NEXT_PUBLIC_*` is inlined at **build** time. A correct
  setting with a stale build and a wrong setting are indistinguishable from the
  browser. On 2026-08-28 I argued from a bare-domain redirect that the Vercel
  variable must be set wrong, and told the owner to change it. It had been
  correct all along; the deployed bundle predated it, and the release's rebuild
  fixed it. I enumerated two possibilities when there were three. Before
  reporting a value is wrong, check whether a build has happened since it
  changed.
- **Do not test tenant resolution through the API alone.** It resolves
  workspaces correctly by slug *and* by host while the browser cannot reach
  them. That asymmetry is exactly how BUG-1644 reached a paying customer.
- **Do not read a generated document alone.** BUG-1578 was invisible in the
  rendered output and only appeared in field values; BUG-1541 was *mis*-reported
  from the rendered document. Read both, every time.
- **`npm run validate:framework` is not the Framework validation job.** It is
  one of eleven steps. A green run there says nothing about the other ten, and
  the one that actually breaks — `generate-component-index.mjs --check` — is
  staled by *source* edits, because the index stores line numbers. It cost a
  full CI cycle on 2026-08-27.

---

## 8. Suggested order

1. Confirm the allowlist with `browser_get_config`, and confirm the tenant still
   exists.
2. Check whether `37a0db54` merged, so you know what is actually deployed.
3. Work §4 top to bottom. It is ordered by consequence, and the first six are
   all reachable from the existing tenant and the admin console.
4. BUG-1516 last of that set — it needs a fresh paid signup, which also gives
   you a second tenant and re-tests provisioning end to end.
5. Then §5: establish the truth of the four go-live records, and get the landing
   variable in front of the owner.
6. Promote anything you find into a record. **No finding may exist only in a
   report** — `docs/bugs/README.md`.

---

## 9. Housekeeping the next session inherits

- The user's primary checkout carries one intentional modification,
  `.mcp.json` (the Stripe origins they added). **It is theirs — do not revert,
  stage or commit it.**
- Delete `.playwright-mcp/` before finishing.
- `develop` and `main` were in sync at `e0aeabcd` when this was written.
- Open counts at that point: 47 open records, CRITICAL 5, HIGH 16, 0 awaiting
  triage.
