# Handoff — Browser-driven QA, from here on the tenant workspace

> Written 2026-08-27, continuing [`2026-08-26-production-admin-e2e.md`](2026-08-26-production-admin-e2e.md).
> Everything below was observed against **production**, not inferred from source.
>
> **The headline: the tenant workspace is enterable for the first time.** The
> activation email that had never been delivered now is, an owner has activated
> and signed in, and `apps/web` — the largest untested surface in the product —
> is finally reachable with a real, paid, provisioned tenant behind it.

---

## 1. Read this before you start the browser

Drive the product with the **`@playwright/mcp` browser**, not with `curl`. The
previous two sessions leaned on the API because the browser profile was locked,
and it cost real findings: BUG-1578 (a UUID rendered as a legal counterparty's
address) was invisible from the rendered document and only showed up in field
values, while BUG-1541 was *mis*-reported from reading the rendered document
rather than the values. Read both, every time.

The rubric, the required workflow and the evidence rules are in
[`docs/development/browser-control.md`](../development/browser-control.md).
It was rewritten and restructured on 2026-08-26 — §9 (the nine-stage review),
§10 (the review matrix) and §14 (failure triage) are the parts to actually
follow rather than skim.

### Three things that will waste your time if you do not know them

1. **`*.ws.dijipeople.com` is NOT in the MCP allowlist.** `.mcp.json` allows
   exactly `admin` · `app` · `api` · `www` `.dijipeople.com`. The tenant
   workspace lives at `<slug>.ws.dijipeople.com`, so **every navigation to it
   will fail with `ERR_BLOCKED_BY_CLIENT`** until that origin is added. This is
   the single biggest blocker to the work below. Adding it is an owner
   decision, and the file is read **only at MCP server start** — the editor
   must be restarted afterwards. Budget for that before planning a session
   around the workspace.
2. **The browser profile is single-instance.** `--isolated` was removed, so a
   second session holding the profile gives
   `Browser is already in use … use --isolated`. Check whether another session
   is live before assuming it is broken.
3. **`curl -w` is broken in this environment.** It returns
   `curl: (43) A libcurl function was given a bad argument` and an HTTP code of
   `000`, for *any* method. A previous session concluded from this that the
   sandbox blocked `DELETE` verbs; it does not. Use `curl -i | head -1`
   instead. That wrong conclusion sat in a handoff for half a day.

---

## 2. Access

**Platform admin** — `admin.dijipeople.com`, `test@dijipeople.com`, password
`helloworld`. `PLATFORM_OWNER`, `permissionKeys: ["platform.*"]`. Sessions
expire after ~30 minutes; the `?next=` redirect returns you where you were.

**Tenant workspace** — `qa-e2e-signup-b-20260826.ws.dijipeople.com`. Owner
`taimurisrar806@gmail.com`, role `system-admin`, status `ACTIVE` since
2026-08-27T09:51Z. **The password is not recorded here and must not be** —
credentials never go in a record, per `docs/bugs/README.md` and
[`.agent/agents/qa.md`](../../.agent/agents/qa.md). Ask the owner at the start
of the session. It was shared in chat on 2026-08-27 and should be rotated.

**API** — `POST /api/admin/auth/login` for platform, `POST /api/auth/login`
with `X-DijiPeople-App: web` for tenant. Both return a bearer token. Useful for
reading field values the UI does not render; **not** a substitute for driving
the screen.

---

## 3. What changed on 2026-08-27

Production went from `21032ae` → `2eadac97` → `5762b2b2`. Two releases.

| | |
|---|---|
| **BUG-1595** | CRITICAL, **VERIFIED**. No tenant on production could send *any* email. Platform and tenant email are two separate stores and the delivery path could not see the working one. Fixed by PLAN-023. |
| **BUG-1515** | HIGH, **VERIFIED**. Undelivered invitations reported as sent. Both halves fixed. |
| **BUG-0034 / BUG-1551** | Two stale `/api/agent/updates` URLs removed, including one naming the production host. |
| — | TASK-0024…0027 shipped in the first release. 23 records filed. Lint ratchet 805 → 789. |

Guarded by **REG-263**, scenario **QA-TENANT-017**.

### The trap that produced BUG-1595, worth internalising

The admin **Settings → Email** screen showed a fully working SMTP provider the
entire time this was broken. It configures the *platform* provider, stored in
`PlatformSetting`. Tenant mail reads `EmailProviderSetting` scoped by
`tenantId`, then `EMAIL_*` env vars. `grep platformSetting` under
`services/api/src/modules/notifications/` returns nothing.

**A successful platform test email proves nothing about tenant delivery**, and
neither does a healthy platform delivery log. Both exercise the working half.

---

## 4. What to test, in value order

### A. The tenant workspace — `apps/web`, entirely unexercised

Nobody has ever driven this product with a real tenant. Everything here is new
ground, and it is where undiscovered defects are densest.

Blocked on the allowlist in §1. Once unblocked:

1. **First-run experience.** A workspace with one user and no data. Every list
   is empty, so every empty state renders here first. Check they say something
   true — BUG-1559 found admin telling users to create records on screens with
   no create control; expect the same class here.
2. **Onboard the first employee** end to end, then a team, then an org unit.
   This is the primary journey of the product and has never been run against a
   provisioned tenant.
3. **Attendance and leave** — request, approve, reject. The approval chain
   crosses `approvals`, `workflows` and `notifications`, and **notifications now
   actually send**, which was not true before today. Confirm mail arrives and
   check `providerSource` on the delivery row: it should read `platform` for
   this tenant, since it has no provider of its own.
4. **Payroll** — a run against one employee. Highest-consequence logic in the
   product.
5. **Settings and branding** — the settings runtime, per
   [`docs/architecture/settings-and-branding.md`](../architecture/settings-and-branding.md).
6. **Tenant isolation, from inside.** Confirmed empty on 2026-08-27 (employee
   list returned 0, no leakage). Re-confirm once data exists: create an
   employee, then verify no other tenant can see it and this tenant cannot
   reach another's records by id.

### B. Reproduce the HIGH bugs in the browser

All five are open and none has been retested since being filed.

| ID | What to drive |
|---|---|
| **BUG-1541** | Generate an agreement from `QA E2E Customer 20260826`. Root cause is established — a tenant-provisioning template populated from a *customer* source, which emits only `customer.*`. Read the rendered body **and** `GET /api/contracts/{id}/document-fields`. |
| **BUG-1578** | Same contract. `customer.address` renders `ec7dbbe3-…`, a UUID, as a legal counterparty's registered address. 1 of 13 customers is affected — the one created through the admin form. Verify by reading the stored value, **not** the form: the form redisplays its own id as a selected label and looks correct. |
| **BUG-1542** | Settings → Monitoring. 1,495 incidents, every detail page 404s. Note `/api/super-admin/platform-monitoring/error-logs` does **not** exist; the real route is `/api/platform/logs/events`. Establish whether the admin route or the API endpoint is the missing half. |
| **BUG-1543** | Stripe webhook 400s during a live payment. Needs another real paid signup. Fix BUG-1516's duplicate-customer condition first — it is the most likely cause and may remove the symptom. |
| **BUG-1544** | Signup step 2 advertises `<slug>.dijipeople.com`, which does not resolve. The real host is `<slug>.ws.dijipeople.com`. |

### C. Never-touched surfaces

Role creation and negative authorization (**the owner asked for this and it is
still not done**), the agreement lifecycle past Draft, the partner journey,
support cases, promotions, invoices and payments as screens, responsive and
keyboard passes at tablet/mobile, and monitoring triage.

**Accessibility is a prerequisite, not a separate pass.** `apps/admin` has zero
`data-testid` and BUG-1552 found 5 of 5 inputs on New Lead with no accessible
name. An unnamed control fails a screen reader and a role-and-name locator for
the same reason, so parts of admin are not drivable by the browser at all until
it is fixed. Expect to hit this.

---

## 5. Scenarios to write

Reuse before writing: `npm run qa:select -- <module>`. The register holds 204
scenarios and 106 declared coverage gaps.

Missing and worth adding, in order:

1. **Tenant first-run** — provisioned tenant, zero data, every module's empty
   state. Nothing covers this.
2. **Employee lifecycle** — hire → team → leave request → approval →
   notification delivered.
3. **Negative authorization** — a role that should *not* be able to write,
   attempting to. Prior QA left two disabled `Read Only Auditor` accounts and a
   trail of 403s worth mining. `QA-AUTH-*` covers login, not refusal.
4. **Agreement generation** — every merge field resolves; no `{{` survives.
   Guards BUG-1541 and BUG-1578 together.
5. **Tenant email routing** — a tenant *with* its own provider must use it;
   `providerSource` must read `tenant`, not `platform`. QA-TENANT-017 covers
   only the no-provider case, which is the half that was broken.

---

## 6. Test data on production

| What | Keep or clear |
|---|---|
| Tenant `QA E2E Signup B 20260826` (`f959c5ff-…`), ACTIVE, paid, owner activated | **Keep.** The only working provisioned tenant and the whole basis of §4A. |
| `QA E2E Customer 20260826` + `CON-20260826-DCA95FD5` | **Keep** until BUG-1541 and BUG-1578 are fixed — the only reproduction of both. |
| `QA E2E Signup 20260826` ×2, `QA E2E Signup B` ×2 | Duplicate evidence for BUG-1516. Keep until fixed. |
| QA leads | **Already deleted** 2026-08-27 (7 → 5). |
| `QA00591` plan, `qa0059+auditor{,2}`, NISACO, Demo, partner/inquiry junk | Pre-existing, predates all of this. |

---

## 7. Dead ends — do not repeat

- **"The activation email failed because of a missing template."** No. The
  scope chain falls back to `NOTIFICATION_SYSTEM_SCOPE_KEY`. It was the
  provider.
- **"Platform email is configured, so tenant email works."** No. §3.
- **"Setting `EMAIL_*` on Render is the fix."** It would have worked, but the
  fix was routing. The credentials were always correct.
- **"The sandbox blocks DELETE."** No — `curl -w` is broken. §1.
- **"BUG-1551 is a new defect."** It is BUG-0034, closed 2026-08-18, still
  occurring: `DIJIPEOPLE_AGENT_UPDATE_URL` is baked into installed builds, so
  pre-fix agents poll the dead path every six hours and **cannot repair
  themselves**. No code change reaches them; they need reinstalling.
- **"Erase Tenant has a weak confirmation."** No. Behind the generic first
  dialog is a rolled-back dry run, destroyed-vs-kept counts, a required reason
  and two typed confirmations. It is the model to copy.

---

## 8. Still open, not QA's to decide

- **29 records await Architect triage.** QA establishes what is true; the
  Architect decides what happens. Do not disposition them from a QA pass.
- **Was the `render.yaml` persistent disk actually provisioned** by the
  2026-08-27 deploy? If the service is not Blueprint-synced it was not, and
  uploaded files and published agent installers are wiped on every deploy.
  Bears directly on BUG-1551.
- **The lint ratchet is 789 against 784 actual.** If a change pushes it over,
  reduce warnings — do not raise the number. That is the file's own rule.

---

## 9. Suggested order

1. Get `*.ws.dijipeople.com` into `.mcp.json`, restart the editor, confirm the
   workspace loads. Without this, §4A is unreachable.
2. Drive the tenant first-run and onboard one employee. Largest untested
   surface, densest in undiscovered defects.
3. Reproduce the five HIGH bugs in the browser and record what you find.
4. Role creation and negative authorization — outstanding since 2026-08-26.
5. Write the scenarios in §5 as you go, not afterwards.
