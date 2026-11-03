# RUN-008 deployment gate evidence - phase: enforced

API: http://localhost:4397 (isolated QA stack). Application worktree: D:\My Work\hrm-dijipeople\dijipeople-starter-verify8

## /api/health
```json
{
  "environment": "development",
  "entitlementEnforcement": {
    "mode": "ENFORCE",
    "enforced": true
  }
}
```

## smoke:deployment - no exception
exit code: 1
```
ok - API health endpoint
    ! commit: unknown — set GIT_COMMIT_SHA (or deploy on a platform that injects one) so release records can observe the deployed SHA rather than assert it.
ok - API reports the commit it is serving
ok - plan entitlements are enforced, not merely logged
ok - protected profile rejects unauthenticated request
ok - CORS origin is accepted
    skipped — STRIPE_WEBHOOK_SECRET is not in this process's environment; set SMOKE_REQUIRE_STRIPE_WEBHOOK_SECRET=1 to require it
ok - Stripe webhook secret is configured
    skipped — set SMOKE_TENANT_SLUG and a tenant root domain (SMOKE_TENANT_ROOT_DOMAIN, TENANT_BASE_DOMAIN or NEXT_PUBLIC_TENANT_BASE_DOMAIN) to check workspace routing
ok - the composed tenant workspace host resolves

not ok - outbox worker is draining events: OUTBOX_WORKER_ENABLED is not "true" on this service. Provisioning is an outbox consumer, so a customer can pay and no workspace is built. See BUG-0904.
Skipping the unauthorised-module probe. Set SMOKE_STARTER_LOGIN_EMAIL and SMOKE_STARTER_LOGIN_PASSWORD (a Starter-plan tenant user).
not ok - auth login works: Expected 2xx, got 401
not ok - authenticated profile works: Expected 2xx, got 401
not ok - major module list endpoint /employees: Expected 2xx, got 401
not ok - major module list endpoint /leave-types: Expected 2xx, got 401
not ok - major module list endpoint /pay-components: Expected 2xx, got 401
not ok - major module list endpoint /claims/types: Expected 2xx, got 401
not ok - a launched market has at least one purchasable plan: 0 of 18 active price(s) are checkout-ready — nobody can buy. Reasons: Stripe Product ID is missing. Stripe Price ID is missing. Stripe environment does not match. Stripe verification has not succeeded. Run `npm run report:commercial` for the full picture.
not ok - legal documents are published: no legal document is published, so a purchase records no consent — run `npm --workspace api run legal:publish -- --confirm` and read its reasons if it refuses
Smoke checks failed: 9
```

## smoke:deployment - SMOKE_ALLOW_UNENFORCED=1
exit code: 1
```
ok - API health endpoint
    ! commit: unknown — set GIT_COMMIT_SHA (or deploy on a platform that injects one) so release records can observe the deployed SHA rather than assert it.
ok - API reports the commit it is serving
ok - plan entitlements are enforced, not merely logged
ok - protected profile rejects unauthenticated request
ok - CORS origin is accepted
    skipped — STRIPE_WEBHOOK_SECRET is not in this process's environment; set SMOKE_REQUIRE_STRIPE_WEBHOOK_SECRET=1 to require it
ok - Stripe webhook secret is configured
    skipped — set SMOKE_TENANT_SLUG and a tenant root domain (SMOKE_TENANT_ROOT_DOMAIN, TENANT_BASE_DOMAIN or NEXT_PUBLIC_TENANT_BASE_DOMAIN) to check workspace routing
ok - the composed tenant workspace host resolves

not ok - outbox worker is draining events: OUTBOX_WORKER_ENABLED is not "true" on this service. Provisioning is an outbox consumer, so a customer can pay and no workspace is built. See BUG-0904.
Skipping the unauthorised-module probe. Set SMOKE_STARTER_LOGIN_EMAIL and SMOKE_STARTER_LOGIN_PASSWORD (a Starter-plan tenant user).
not ok - auth login works: Expected 2xx, got 401
not ok - authenticated profile works: Expected 2xx, got 401
not ok - major module list endpoint /employees: Expected 2xx, got 401
not ok - major module list endpoint /leave-types: Expected 2xx, got 401
not ok - major module list endpoint /pay-components: Expected 2xx, got 401
not ok - major module list endpoint /claims/types: Expected 2xx, got 401
not ok - a launched market has at least one purchasable plan: 0 of 18 active price(s) are checkout-ready — nobody can buy. Reasons: Stripe Product ID is missing. Stripe Price ID is missing. Stripe environment does not match. Stripe verification has not succeeded. Run `npm run report:commercial` for the full picture.
not ok - legal documents are published: no legal document is published, so a purchase records no consent — run `npm --workspace api run legal:publish -- --confirm` and read its reasons if it refuses
Smoke checks failed: 9
```

## smoke:deployment - with a Starter tenant user (behavioural probe)
exit code: 1
```
ok - API health endpoint
    ! commit: unknown — set GIT_COMMIT_SHA (or deploy on a platform that injects one) so release records can observe the deployed SHA rather than assert it.
ok - API reports the commit it is serving
ok - plan entitlements are enforced, not merely logged
ok - protected profile rejects unauthenticated request
ok - CORS origin is accepted
    skipped — STRIPE_WEBHOOK_SECRET is not in this process's environment; set SMOKE_REQUIRE_STRIPE_WEBHOOK_SECRET=1 to require it
ok - Stripe webhook secret is configured
    skipped — set SMOKE_TENANT_SLUG and a tenant root domain (SMOKE_TENANT_ROOT_DOMAIN, TENANT_BASE_DOMAIN or NEXT_PUBLIC_TENANT_BASE_DOMAIN) to check workspace routing
ok - the composed tenant workspace host resolves

not ok - outbox worker is draining events: OUTBOX_WORKER_ENABLED is not "true" on this service. Provisioning is an outbox consumer, so a customer can pay and no workspace is built. See BUG-0904.
not ok - a Starter tenant is refused a module its plan does not include: Starter login: expected 2xx, got 401
not ok - auth login works: Expected 2xx, got 401
not ok - authenticated profile works: Expected 2xx, got 401
not ok - major module list endpoint /employees: Expected 2xx, got 401
not ok - major module list endpoint /leave-types: Expected 2xx, got 401
not ok - major module list endpoint /pay-components: Expected 2xx, got 401
not ok - major module list endpoint /claims/types: Expected 2xx, got 401
not ok - a launched market has at least one purchasable plan: 0 of 18 active price(s) are checkout-ready — nobody can buy. Reasons: Stripe Product ID is missing. Stripe Price ID is missing. Stripe environment does not match. Stripe verification has not succeeded. Run `npm run report:commercial` for the full picture.
not ok - legal documents are published: no legal document is published, so a purchase records no consent — run `npm --workspace api run legal:publish -- --confirm` and read its reasons if it refuses
Smoke checks failed: 10
```

## Summary
- health.enforced = true (mode ENFORCE)
- smoke without exception: exit 1; enforcement check PASSED
- smoke with SMOKE_ALLOW_UNENFORCED=1: exit 1; no warning printed; enforcement check PASSED
- smoke Starter behavioural probe: FAILED
