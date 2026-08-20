# First production launch — the ordered actions

Owner: whoever holds the Render and Stripe accounts. Process:
[`deployment-runbook.md`](deployment-runbook.md). Readiness verdict and its
evidence: [`TASK-0010`](../tasks/TASK-0010-go-live-readiness.md).

This is not the generic runbook. It is the specific list of things that must
happen for **this** release, in order, written because the release contains a
first-ever production deploy of 217 migrations and a commercial surface that is
deliberately closed until someone opens it.

Nothing here can be done by an agent. Every step needs an account nobody in this
repository holds.

---

## What is already true

Verified on 2026-08-20 against throwaway databases built from the full migration
chain:

- 217 migrations apply from empty, and re-applying is a clean no-op.
- `npm run release` — the literal `preDeployCommand` — runs end to end and is
  idempotent: a redeploy publishes nothing new and archives nothing.
- The price schedule is seeded: 36 prices across Pakistan (PKR), Qatar (QAR) and
  International (USD).
- **Nothing can be bought.** All 36 prices are `NOT_SYNCED` with no Stripe price
  id, and `deriveCheckoutReadiness` refuses any price that is not a verified,
  synced, active Stripe price. The commercial surface is closed by construction,
  not by configuration.

That last point is the reason this checklist can exist at all: the deploy is
safe to perform *before* the commercial decisions are finished.

---

## 1. Set the environment variables Render does not have

`render.yaml` declares them; the dashboard must carry the values. The ones that
are new in this release:

| Variable | Why |
|---|---|
| `PLATFORM_SUPER_ADMIN_EMAIL` | `seed:admin` runs inside `preDeployCommand`. Without it the **first** deploy of a new environment aborts — see [[BUG-0085]]. |
| `PLATFORM_SUPER_ADMIN_PASSWORD` | Minimum 12 characters. |
| `PLATFORM_OPS_NOTIFICATION_EMAILS` | Optional. Lifecycle notifications with no tenant owner have nowhere to go without it; they are skipped and logged rather than lost. |
| `RETENTION_POLICY_VERSION` | Optional. Stamped onto cancellation records. |

`OUTBOX_WORKER_*`, `SEAT_OVERAGE_*` and `TENANT_RETENTION_DAYS` are also new but
carry defaults in `render.yaml` and need no dashboard value.

**Then remove the password after the first successful deploy.** `seed:admin` is
a no-op once an active super admin exists, and it never overwrites one. Leaving
the password set does not break anything — it simply keeps a live credential in
a dashboard for no reason.

## 2. Confirm Stripe can present PKR and QAR

**The one thing that cannot be checked from here**, and the only genuine unknown
left in the release.

Stripe's supported presentment currencies depend on the account. If PKR or QAR
is not available, that market cannot take self-service payment.

It fails safely: an unsynced price is not checkout-ready, so the site says
checkout is unavailable rather than charging a wrong amount. But a market that
cannot take money is not launched, whatever the pricing page says.

Check before step 4, because it decides whether step 4 covers three markets or
one.

## 3. Deploy

Merging to `main` triggers it. `preDeployCommand` then runs, in this order:

```
prisma migrate deploy   217 migrations, from empty on a new database
seed:config             reference data, plans, markets, the 36 prices
seed:verify             refuses to continue if required configuration is missing
seed:admin              creates the super admin, or skips if one exists
seed:legal              writes the ten legal documents as drafts
legal:publish --confirm publishes them
```

If this aborts, the deploy aborts and nothing serves. That is the intended
behaviour: a half-configured platform is worse than one that did not start.

**Watch for the legal step.** Until this release a deployment published no legal
documents at all, and the purchase wizard only requires agreements that carry a
published version — so a purchase recorded **no consent**. The first run should
report ten published; every run after it, ten already-published and zero
skipped.

## 4. Open the commercial surface

Nothing is sellable until a price is synced to Stripe. In Platform Admin, for
each plan and market you intend to sell:

- `POST /super-admin/plans/:planId/prices` with `syncToStripe` — or the
  equivalent action in the Admin plans screen — creates the Stripe price object
  and records its id.
- Sync **only the `PER_SEAT` prices**. The `FLAT` ones are `SALES_ASSISTED` and
  are meant to be quoted by a person, not bought online; syncing them does not
  make them publicly purchasable — the resolver refuses them on the self-service
  channel — but there is no reason to create Stripe objects nobody will use.
- Enterprise+ has no price and needs none. It is `CUSTOM_ONLY` and answers
  `CUSTOM_CONTRACT_ONLY`.

After syncing, confirm the pricing page quotes what you expect at a few team
sizes, including one **below** the plan minimum: a six-person company on Starter
must be shown ten seats billed, not six.

## 5. Verify

```bash
npm run smoke:deployment          # needs SMOKE_* variables for the deployed URL
```

Then by hand, because these are the things a smoke test cannot judge:

- The pricing page shows PKR in Pakistan, QAR in Qatar, USD elsewhere.
- The annual price is exactly ten times the monthly one, everywhere.
- A purchase records a consent row against the published Terms.
- Signing in, and signing out, actually revokes the session.

## 6. Record it

`docs/deployment/release-history/YYYY-MM-DD-production-<sha>.md`, from
[`release-report-template.md`](release-report-template.md).

That folder is empty and its README says why: *"nothing has yet been deployed
through this process, and inventing a record to populate the folder would put
fiction in the one place that has to be trustworthy."* This release is the one
that ends that. Fill the outcome fields **after** the deploy, never before —
where a check could not be run, `NOT_OBSERVED — <reason>` is the honest entry.

---

## What is deliberately not done

| Item | Why |
|---|---|
| [[BUG-0084]] — seven unique constraints missing from the migration chain | Additive and safe on an empty database; `CREATE UNIQUE INDEX` can abort a deploy on a populated one. Belongs in the first migration **after** launch, when the production database can be checked for duplicates first. |
| [[BUG-0052]] — two unfixable `xlsx` advisories | Present but unreachable: the parse path moved to ExcelJS and no `XLSX.read` call site remains. Owner-accepted. |
| [[ITEM-0070]] — dropping `xlsx` entirely | Requires moving the workbook **writer**, which changes the bytes of files banks consume. Not in the release that first meets paying customers. |
| [[ITEM-0072]] — six zero-amount market-less prices | Created by two old migrations, unbuyable by two independent guards, but noisy. Cosmetic. |
| No staging environment | This release's first contact with a real Render environment is production. Mitigated as far as a laptop can mitigate it — the actual `preDeployCommand` was run end to end against a virgin database, which is what found BUG-0085 — but a dry run is not a deploy. |
