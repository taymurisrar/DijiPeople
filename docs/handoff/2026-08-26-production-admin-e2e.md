# Handoff — Production admin E2E QA, 2026-08-26

Written so another session can resume without re-deriving anything. Everything
below was observed against **production**, not inferred from source.

Session record: `docs/sessions/SESSION-0061-*.md` · Branch:
`agent/invitation-delivery-visibility` · Base: `4f0da2be` (origin/develop)

---

## 1. Resume here

Two things are mid-flight.

**A. A deploy is blocked on GitHub, not on the work.**
Commits `378fb6ab` (fix) and `07627238` (records) are pushed. GitHub Actions
went into `major_outage` at 15:11Z and produced no run. `main` requires the
`CI required gate` with `enforce_admins: true`, so **it cannot merge until
Actions recovers**. Do not look for a bypass; there isn't one and that is
deliberate.

When the gate goes green:

```bash
# 1. integrate to develop, keeping the tip equal to the CI-verified SHA
git push origin agent/invitation-delivery-visibility:develop
# 2. PR develop -> main, wait for the exact-SHA gate, merge
# 3. verify the deploy actually shipped — a merge is not a deploy
curl -s https://api.dijipeople.com/api/health   # check commit hash
```

Note `scripts/await-ci.mjs` gives up after two minutes when no run is
registered. Correct normally, wrong during an outage. There is a tolerant
waiter at `<scratchpad>/wait-ci.sh <sha> <seconds>`.

**B. One production question is still open.** See §5, BUG-1515: the reason a
paying customer's activation email was never delivered. It is recorded in a
tenant `EmailDeliveryLog` row that no admin screen can reach. The deployed fix
makes it legible; until then it needs a direct query:

```sql
SELECT status, "errorMessage", metadata, "requestedAt"
FROM "EmailDeliveryLog"
WHERE "tenantId" = 'f959c5ff-c8f2-419b-ae79-e99989557771'
  AND "eventCode" = 'AUTH_ACCOUNT_ACTIVATION'
ORDER BY "requestedAt" DESC LIMIT 5;
```

---

## 2. Access and environment

**Admin login:** `test@dijipeople.com` / `helloworld` — `PLATFORM_OWNER`,
`permissionKeys: ["platform.*"]`. Sessions expire after ~30 minutes; the
`?next=` redirect correctly returns you to the page you were on.

**Browser:** the MCP Playwright server reaches production. `.mcp.json` uses
`--allowed-origins` — an **allowlist** of `admin` / `app` / `api` /
`www.dijipeople.com`. Everything else is blocked, including `localhost` and
`checkout.stripe.com`. Add Stripe's hosts before attempting checkout in-browser.

**`.mcp.json` is read once at MCP server start.** Editing it mid-session does
nothing; the editor must restart. This cost two restarts today.

**Gotchas that already burned time:**

- The harness classifier blocks `git worktree add`, `git add` in some forms,
  `session.mjs start`, editing `.mcp.json`, and reading Render env vars. Work in
  the primary checkout on an `agent/*` branch when a worktree is refused.
- API unit tests need `DATABASE_URL` set to anything:
  `DATABASE_URL="postgresql://u:p@localhost:5432/dummy" npm --workspace api run test -- <pattern>`
- Regenerate derived artifacts **in the same commit** or CI framework validation
  fails: `rebuild-backlog`, `remediation:sync`, `sessions:rebuild`, then
  `knowledge:dashboards` **last** (it reads the session index).
- Run `npm --workspace api run lint` before pushing — prettier is a required gate.

---

## 3. What was tested

### Reachability — complete
All **17 sidebar routes** and all **20 settings pages** return 200 and render.
Enumerated: Dashboard, Leads, Customers, Onboarding, Partners, Partner
inquiries, Onboarding reviews, Contracts, Templates, Tenants, Subscriptions,
Plans, Promotions, Invoices, Payments, Commissions, Support cases, Monitoring,
Settings (+ 20 sub-pages across 9 category tabs).

### The commercial funnel — complete, end to end
Public signup → customer → payment → provisioning → live workspace. **Works.**

A real Stripe test payment (QAR 80, Starter, 10 seats) produced in ~4 seconds:
`PAID` invoice → `SUCCEEDED` payment → `ACTIVE` subscription → `ACTIVE` tenant
`TEN-000001` → 7 modules entitled → wildcard DNS + TLS verified → workspace
serving at `qa-e2e-signup-b-20260826.ws.dijipeople.com` (307 → `/login`).

### CRUD and record actions — complete
Create, edit, assign owner, delete — all work. Tenant command bar (9 actions),
Validate Tenant, Erase Tenant (dry run + real), agreement creation from a
customer, agreement PDF generation, resend invitation.

### Settings — partially
Read and verified: tenant provisioning, Stripe integration, monitoring, users &
roles, platform email. **Changed one setting** (see §6).

### Infrastructure verified independently of the UI
- `*.ws.dijipeople.com` wildcard DNS resolves; TLS cert is a genuine wildcard.
- `<slug>.dijipeople.com` — the domain signup advertises — **does not resolve**.
- Live SMTP (`live.smtp.mailtrap.io`) delivers to external Gmail inboxes.
- All **10 legal documents** are genuine (34–44 KB, no draft/placeholder/`{{}}`
  markers, all "in force since 23 August 2026"). Checked the documents, not the
  list.

---

## 4. What is NOT tested — the remaining queue

Roughly in value order.

1. **Tenant workspace itself.** Nobody has signed into
   `qa-e2e-signup-b-20260826.ws.dijipeople.com`. Blocked on the activation
   email. This is the biggest gap — the entire tenant product (`apps/web`) is
   untested from a real provisioned tenant.
2. **Role creation and permission enforcement.** The owner asked for this.
   Roles exist (Platform Owner/Admin/Operations, Presales, Partner Manager,
   Contract Manager, Legal Reviewer, Finance Manager, Billing User…) and the
   Add-user form offers them, but **no role was created and no negative
   authorization test was run.** Prior QA left two disabled `Read Only Auditor`
   accounts and a trail of 403s in the error log — worth mining.
3. **The agreement lifecycle past Draft.** 15 stages exist (Draft → Internal
   Review → … → Fully Executed → Active → Expired). Only document generation
   was exercised. Signature request, counterparty signing, and the
   `TENANT_PROVISIONING` lifecycle gate are untested.
4. **Partner journey.** Only one partner record exists and it is QA junk. The
   inquiry → partner → agreement → commission chain is unexercised. Commissions
   is empty.
5. **Support cases.** Empty. Creation, SLA timers, assignment untested.
6. **Promotions / discounts.** Empty, `Add promotion` never clicked.
7. **Invoices and payments as screens.** Only observed via the funnel; no manual
   invoice, refund, or payment reconciliation tested.
8. **Responsive and accessibility passes.** Everything was driven at 1440×900.
   No tablet/mobile widths, no keyboard-only navigation. Note admin carries
   **zero `data-testid`** and several forms have **no accessible names**, so it
   is partly untestable by assistive technology today.
9. **The other two apps.** `apps/web` (tenant product) and
   `apps/agent-desktop` were not touched at all.
10. **Monitoring queue triage.** 1,495 incidents, 1 critical, 0 ever resolved —
    and every detail page 404s, so the queue could not be worked.

---

## 5. Findings

### Filed as records
| ID | Sev | Title |
|---|---|---|
| **BUG-1515** | HIGH | Tenant activation invitation reported as sent when it was never delivered |
| **BUG-1516** | HIGH | Public signup creates duplicate customer records, breaking Stripe tenant resolution |

Both `ArchitectDisposition: TRIAGE_REQUIRED`, both with full evidence,
reproduction and impact. BUG-1515's fix is on the branch; the underlying
delivery cause is explicitly marked *not established*.

### NOT yet filed — needs records
These exist only in the session transcript and this document. **They should be
filed before the next QA pass closes.**

| Sev | Finding | Evidence |
|---|---|---|
| HIGH | **Agreement PDFs render 30+ unsubstituted `{{handlebars}}`** — customer legal name, address, tenant name/URL, admin contact, modules, SLA, billing dates. Any agreement sent is unusable. Contract *title* merges fine, so it is template-body merging specifically. Whitespace is also lost between tokens. | `CON-20260826-DCA95FD5`, generated from template "DijiPeople Tenant Provisioning & Service Order" |
| HIGH | **Monitoring incident detail 404s** — every `/settings/monitoring/error-logs/<id>` returns HTTP 404. 1,495 incidents, none openable. | Direct navigation → 404 page; 6 distinct ids failed on prefetch |
| HIGH | **Stripe webhook rejections on live payments** — `POST /api/billing/stripe/webhook → 400 VALIDATION_FAILED`, twice, during a real payment. Raises the CRITICAL "a customer may have paid without us knowing" alert. Causally linked to BUG-1516. | Render logs 13:36:42Z; 2 platform events |
| MED-HIGH | **Signup advertises a workspace domain with no DNS** — step 2 shows `<slug>.dijipeople.com` and asserts "is available". That domain does not resolve. The success page and real workspace correctly use `<slug>.ws.dijipeople.com`. | `nslookup` both forms |
| MED | **Manual onboarding creation 409s** — `POST /api/platform-runtime/customer-onboarding` fails on `CustomerOnboarding_onboardingOwnerUserId_fkey` (P2003/23503). The backend defaults the owner to the acting **platform** user id, which is not a valid `User` FK. Blocks admin-initiated provisioning; the paid path is unaffected. | Full response body captured |
| MED | **Required fields on unfocused tabs are undiscoverable** — save reports "Complete the required fields" with nothing marked on the visible tab. Onboarding spreads **8 required fields across 4 of 6 tabs**. | Customers and Onboarding forms |
| MED | **Prerequisite message states the inverse of the truth** — "Onboarding prerequisites are not complete: Industry is selected, Company size is selected" when they are *not* selected. | Onboarding save |
| MED | **`validate` and `create` disagree** — `POST …/customer-onboarding/validate` returns 201 for payloads `POST …/customer-onboarding` then rejects 400/409. | Network panel |
| MED | **Raw internals shown to users** — "Database constraint failed", "primaryContactFirstName must be shorter than or equal to 100 characters" surfaced in a modal. | Error modal |
| MED | **Lead record shows two different owners on one screen** — header `Test User`, body `Not set`. | Lead detail |
| MED | **Desktop agent auto-update broken** — `/api/agent/updates/latest.yml` 404s repeatedly, every few hours. | Error log, 2h and 8h old |
| MED | **Form inputs have no accessible name** — labels are `div`s, not `<label>`. Leads, Customers, Onboarding. Unusable with a screen reader. | 5/5 inputs on New Lead |
| MED | **Duplicate indistinguishable picker entries** — owner picker lists two identical "Taimur Israr" (different accounts); template list has "DijiPeople SaaS Subscription & Services Agreement" twice. | Both pickers |
| MED | **Admin calls its own API with `pageSize=5` against a min-10 validator** → 400. | Error log, `/platform-runtime/partners` |
| MED | **Inactive plan offered for sale** — `QA00591` (Inactive, 0 prices) is selectable as a customer's preferred plan. | Customer form |
| LOW | Epoch dates — contracts render `Jan 1, 1970` instead of `—`. | 2 of 7 contracts |
| LOW | React #418 hydration error on the dashboard. | Console |
| LOW | Copy: "1 records", "Create a invoice". | Lists |
| LOW | Empty states instruct "Create a X" on screens with **no create control** (invoices, payments, commissions). | Three screens |
| LOW | Delete confirmation does not name the record being deleted. | Lead delete |
| LOW | Verification step has **no Back button** — a mistyped admin email means restarting all 5 wizard steps. | Signup |
| INFO | Admin session expires after ~31 minutes. | Observed |

---

## 6. Changes made to production this session

The next session must know these; they are not the state the system was found in.

1. **Enabled "Wildcard DNS / proxy / TLS ready"** in Settings → Tenant
   provisioning. Verified DNS, proxy and a genuine wildcard cert first. Tenant
   readiness `Workspace routing` flipped blocked → OK.
2. **Erased three tenants** — `demo`, `kamsf`, `tes` — with receipts and stated
   reason. Each ~1,649 rows across 28 tables. Customers and contracts were
   detached and kept, exactly as the dialog promised.
3. **Created and deleted** one test lead.
4. **Sent one platform test email** to `taimurisrar806@gmail.com` (delivered).
5. **Left test data in place** — see §7.

---

## 7. Test data still on production

| What | Why it is there |
|---|---|
| `QA E2E Customer 20260826` + agreement `CON-20260826-DCA95FD5` | Reproduction case for the `{{placeholder}}` PDF bug |
| `QA E2E Signup 20260826` ×2, `QA E2E Signup B 20260826` ×2 | Duplicate evidence for BUG-1516 |
| Tenant `QA E2E Signup B 20260826` (`f959c5ff-…`), ACTIVE, paid | **The only working provisioned tenant.** Evidence the funnel works, and the subject of BUG-1515. Recommend keeping until the email fix is verified. |
| Pre-existing junk: `QA00591` plan, `qa0059+auditor{,2}` users (disabled), `DijiPeople QA Verification` ×2, `NISACO`, `Demo`, `QA Automation Co - IGNORE` partner + inquiry, `DijiPeople QA Automation - IGNORE` lead, `E2E Landing …` lead, Xoul Ltd / DIJINATION contracts | Left by earlier QA, predates this session |

Cleanup was approved by the owner but deliberately deferred until BUG-1515 is
verified.

---

## 8. Dead ends — do not repeat these

- **"The activation email failed because the tenant has no
  `AUTH_ACCOUNT_ACTIVATION` template."** Wrong. `notificationScopeChain` already
  falls back to `NOTIFICATION_SYSTEM_SCOPE_KEY`, and `seedSystemEmailTemplates()`
  runs on every release. Running `seed:config` against production will not fix it.
- **"The platform delivery log's silence proves nothing was sent."** Wrong. That
  log (`/api/super-admin/platform-email/deliveries`) covers *platform* mail. The
  activation email goes through the *tenant* path and lands in
  `EmailDeliveryLog`, which admin cannot read.
- **"Erase Tenant has a dangerously weak confirmation."** Wrong. The generic
  first dialog is only a gate; behind it is a proper panel with a rolled-back
  dry run, destroyed-vs-kept counts, a required reason, type-the-tenant-name and
  type-`ERASE TENANT`. It is a model of the pattern.
- **"Stripe webhooks are failing / nothing is sellable / provisioning is
  broken."** All overstated from a 7-day failure counter and pre-payment state.
  The paid path works end to end.
- **"Resend invite is a dead button."** It opens a confirmation dialog that is
  easy to miss in a text scan.

---

## 9. Suggested next order

1. Land the blocked deploy once Actions recovers, then read the delivery reason
   and finish BUG-1515.
2. File the unfiled findings in §5 as records.
3. Fix the agreement `{{placeholder}}` merge — the most customer-visible defect.
4. Fix BUG-1516; it also clears the CRITICAL Stripe attribution alert.
5. Sign into the tenant workspace and start on `apps/web` — the largest
   untested surface.
