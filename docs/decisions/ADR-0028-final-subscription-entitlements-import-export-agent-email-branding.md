---
ID: ADR-0028
aliases: [ADR-0028]
Title: Final subscription entitlements - basic import/export on every plan, desktop agent Enterprise/Custom, essential email branding for all
Status: ACCEPTED
CreatedAt: 2026-11-01
UpdatedAt: 2026-11-01
---
# ADR-0028 - Final subscription entitlements

## Status

Accepted - 2026-11-01. Owner decision after RUN-005. Supersedes the Starter
configuration decided during the go-live remediation (import/export as a
Growth feature, the desktop agent as a Growth feature, the "agent sync stays on
attendance" carve-out recorded in the `desktop-agent` catalog comment).

## Decision

| Capability | Key | Starter | Growth | Enterprise | Custom |
|---|---|---|---|---|---|
| Basic import/export, templates, validation, row errors, secure exports | `data-import-export` | yes | yes | yes | per contract |
| Advanced data management (saved mappings, schedules, transformations, integrations) | `advanced-data-management` | no | yes | yes | per contract |
| Desktop agent (login/refresh, enrolment, sessions, heartbeats, settings, DLP) | `desktop-agent` | no | no | yes | per contract |
| Attendance hardware integrations | `attendance-integrations` | no | yes | yes | per contract |
| Essential email branding (name, logo, accent, standard footer) | none - always on | yes | yes | yes | yes |
| Email template wording customization | `email-template-customization` | no | yes | yes | per contract |
| Email white-label (drops the DijiPeople attribution) | `email-white-label` | no | no | yes | per contract |

"Custom" is the Enterprise+ contract plan plus explicit `TenantFeature` rows with
`source: CUSTOM`, which are authoritative in both directions
(`tenant-entitlement.rule.ts`). An ordinary `MANUAL` override can never grant
past the plan.

## Rules this creates

1. **Plan widens WHERE, never WHO.** Opening basic import/export to Starter does
   not change who may use it: `data-management.*` permissions stay with
   administrative roles and HR, every export inherits the caller's own row scope,
   and `data-management-access.spec.ts` pins the holders.
2. **The advanced tier is a separate key.** `advanced-data-management` has no
   routes yet. Whoever builds one must gate it with this key and move it out of
   `ENTITLEMENT_UNGATED_FEATURE_KEYS`. It must never share `data-import-export`.
3. **The agent is gated on every credential path.** `AgentController` and
   `DlpController` carry `EntitlementGuard`. `POST /agent/auth/login` and
   `/agent/auth/refresh` are `@Public()`, so the guard cannot see them;
   `AgentService` calls `TenantEntitlementService.assertEntitled` *after* the
   password or refresh token is proven (so the refusal is not an enumeration
   oracle). A downgraded tenant therefore cannot mint or renew an agent
   credential, and already-issued access tokens die at the guard.
4. **No implicit perpetual access.** After a downgrade the only extension is an
   explicit grandfather row (`entitlement:grandfather`, ADR-0009), which is a
   visible, revocable `CUSTOM` override - never an inferred right.
5. **Branding is presentation, applied at send time.** `EmailBrandingService`
   frames the rendered message; it never edits stored templates, links, tokens or
   copy, escapes tenant text, accepts an accent only as `#rrggbb` with AA contrast
   against white button text, builds the logo URL itself from the tenant slug, and
   on any failure falls back to the unbranded message so a security email is never
   held back. Wording customization (Growth+) is enforced in the authoring
   service; the preview, test-send and read paths stay open.

## Migration and seed for existing tenants

- Migration `20261101090000_split_data_import_export_entitlement`: renames the
  `data-management` key to `advanced-data-management` on every `PlanFeature` and
  `TenantFeature` row (no one loses what they had), and grants
  `data-import-export` to **every** plan, including custom plans the catalog
  reconcile does not touch. Idempotent; never disables anything.
- `npm run seed:config` (runs on every deploy) reconciles the catalog plans: it
  disables `desktop-agent` on Growth and enables the new keys on the plans that
  sell them.
- Growth tenants that already use the agent: run `entitlement:grandfather`
  (dry-run first). Its `desktop-agent` probe counts `AgentRefreshToken` rows.
- `repair:plan-capabilities` and the grandfather probes were updated for the
  renamed keys.

## Consequences

- QA expectations that Import is absent on Starter (SMK-004 redirect to a plan
  gate, CMD-022, GRW-001..004) and that Growth owns the agent (GRW agent rows)
  are superseded; RUN-006 must assert the opposite.
- The settings tree changes shape per plan: Starter +1 page (Import & Export),
  Growth -2 (agent, app downloads), Enterprise unchanged.

## Related

[[ADR-0009-entitlement-enforcement-cutover]] - [[ADR-0005-settings-capability-attribution]]

## Amendment 2026-11-01 (after RUN-006) - Custom is an explicit-grant model

Owner decision on DP-QA-042. The table above said Custom was "per contract"; the
catalogue gave `enterprise-plus` every key, so a Custom tenant silently received
the Desktop Agent and white-label e-mail. That is withdrawn.

| Capability | Starter | Growth | Enterprise | Custom (`enterprise-plus`) |
|---|---|---|---|---|
| `desktop-agent` | no | no | yes (catalogue) | **only with an explicit `CUSTOM` grant** |
| `email-white-label` | no | no | yes (catalogue) | **only with an explicit `CUSTOM` grant** |

- Mechanism: no new plan key. `enterprise-plus` no longer lists the two keys
  (`CONTRACT_GRANT_ONLY_FEATURE_KEYS`). The existing tenant-modules control plane
  writes a `TenantFeature` row with `source: CUSTOM` when an operator grants one
  to a tenant on that plan; it refuses the grant on any other plan, and refuses
  every other key beyond the plan. A missing grant means off.
- Withdrawing the Desktop Agent invalidates the entitlement cache at once and
  revokes the tenant's `AgentRefreshToken` rows, so a device cannot mint a new
  access token; an already-issued access token ends with the next guarded
  request, because the cache entry is gone.
- A plan-level change (subscription downgrade, catalogue edit applied by
  `seed:config`) is bounded by the 60 s entitlement snapshot. Login and refresh
  re-check entitlement on every call, so no new session can start.
- Existing `enterprise-plus` tenants that use the agent today lose it at the next
  `seed:config` unless `npm run entitlement:grandfather` (probe: AgentRefreshToken)
  has written an explicit `CUSTOM` grant for them. Run it, dry-run first, before
  releasing.

## Amendment 2 (2026-11-01) - exactly three predefined plans; Custom is a dynamic plan

**Supersedes the first amendment above.** `enterprise-plus` is not a plan. DijiPeople has
three predefined plans - Starter, Growth, Enterprise - and every other plan is created
dynamically for a customer, an agreement, a promotion, a pilot or any other business
decision.

- **Explicit metadata, not names:** `Plan.kind` (`CATALOGUE` | `CUSTOM`, default
  `CUSTOM`). The catalogue seed creates and reconciles only `CATALOGUE` plans, retires
  only `CATALOGUE` plans the catalogue stopped listing, and skips (with a warning) a
  custom plan that happens to hold a catalogue key. A seed can never rewrite, retire or
  price a custom plan.
- **Custom plans reuse the existing plan framework** (`POST/PATCH /super-admin/plans`,
  `PlanPrice`, publication, sales model, the tenant-creation workflow). Added to it:
  customer eligibility (`eligibleCustomerAccountId`), a validity window
  (`effectiveFrom`/`effectiveUntil`), `salesModel` on create/update, audit entries
  (`PLAN_CREATED`, `PLAN_UPDATED` with before/after feature lists), and an entitlement
  cache flush when a plan's features change.
- **No inheritance:** a custom plan entitles exactly the features it lists, more or fewer
  than any predefined plan. The Desktop Agent and white-label e-mail are therefore in a
  custom plan only when selected.
- **Baseline:** basic data import/export (`data-import-export`) is available to every
  tenant whatever its plan lists (`BASELINE_FEATURE_KEYS`), custom plans included.
- **Limits:** a plan reserved for one customer, or bounded by a validity window, cannot
  be self-service (public checkout can enforce neither). Eligibility and the window are
  enforced at tenant creation and in public listings. Expiry stops a plan being
  *assigned*; it does not terminate a running subscription (no new billing behaviour).
- **Predefined plans** keep their key and features under the catalogue; the console
  refuses to edit them and points to creating a custom plan.
- **Legacy `enterprise-plus`** is converted in place, never deleted: same id, renamed to a neutral
  `custom-<id>` / `Custom Plan <ID>` (old key kept only as metadata provenance), CUSTOM_ONLY, reserved to its
  single customer or ARCHIVED when several use it, features and subscriptions untouched. Contracted features
  stay until an approved commercial review. See the migration
  `20261102090000_plan_kind_and_custom_plan_metadata` and handoff v6.
- Eligibility (reservation, validity window) is enforced on customer select, onboarding, provisioning, the public
  catalogue and self-service checkout; expiry stops new assignments only, never a running subscription.
- Per-feature limits/quotas do not exist in the product today and were not invented.
