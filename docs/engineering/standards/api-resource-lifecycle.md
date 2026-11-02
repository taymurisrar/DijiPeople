# API resource lifecycle standard

Prevents incomplete — and unsafe — backend capabilities. Enforced by `scripts/check-api-completeness.mjs` against `docs/engineering/api-resource-contracts.json` (policies API-001…API-005).

## Resource types

| Type | Meaning | Default lifecycle |
|---|---|---|
| **standard-mutable** (A) | Ordinary editable business resource | create · get · list(+search/filter/sort/paginate) · update(PATCH) · delete/deactivate; restore, bulk, import/export where the domain supports them |
| **read-only** (B) | Reports, catalogues, projections, logs | GET only. Any PATCH/PUT/DELETE/restore/bulk needs an `allow` entry with an ADR-backed reason (API-003) |
| **action** (C) | Command endpoints (approve, send, sync) | Verbs as the domain defines; each is its own authorization decision |
| **sensitive** (D) | Auth, payroll, billing, compensation, contracts, audit, legal, permissions, platform users | No DELETE/restore/bulk unless explicitly allowed and tested; financial and historical records are corrected by reversal, not deletion |

Deleting is never the default for D, nor for anything historical or financial. A gap is **not** a defect to be filled mechanically: either implement the operation properly, or record in `notApplicable` why it is prohibited (≥10 chars of real reason). Never add an endpoint to turn a cell green.

## Every route (all types)

1. `@UseGuards(JwtAuthGuard, PermissionsGuard)` (or a platform guard) — API-004, zero exceptions today.
2. `@Permissions(...)` **and** `@RequirePermission(...)` (tenant) or `@RequirePlatformPermission(...)` — API-005.
3. `tenantId` from `request.user`; object-level scope; explicit `select`; no DTO spread into Prisma (SEC-001/002).
4. DTO with `class-validator`; unknown fields are a 400.
5. Errors from the catalog; state changes audited with before/after.
6. Stable response shape; pagination/sort/filter contract for list; idempotency and concurrency control where a retry or lost update would corrupt (payments, approvals, provisioning).
7. Entitlement checks where the plan gates the feature.
8. Colocated spec incl. authorization negatives; update the frontend client and DTO in the same change.

## The gate, precisely

- **API-001** every controller is classified; a new one fails until it is.
- **API-002** `requires` ops exist or are `notApplicable` with a reason. Today's unreviewed gaps are in `baseline.missingRequiredOps` (ratchet: may only shrink — do not add to it).
- **API-003** read-only/sensitive verbs.
- **API-004** guard present. **API-005** permission present (299 legacy routes baselined; platform/partner/contracts routes largely use inline checks — review them, then remove from the baseline).

Limits, honestly: this is static analysis of decorators. It proves a route is *declared* correctly, not that its service enforces scope. Behaviour is proven by specs, `wiring-invariants.spec.ts` and e2e. OpenAPI contract diffing is **not yet** in place (no committed baseline) — roadmap item R-1.

`--inventory` regenerates `api-completeness-inventory.md`: genuinely-missing (`GAP`, unreviewed) vs intentionally prohibited (`n/a`).
