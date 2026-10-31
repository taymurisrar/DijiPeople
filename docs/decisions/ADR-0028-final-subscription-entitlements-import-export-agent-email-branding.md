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
