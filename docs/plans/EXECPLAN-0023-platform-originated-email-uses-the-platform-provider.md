# ExecPlan — Platform-originated email uses the platform email provider

> Plan `PLAN-023`, resolving [[BUG-1595]] (CRITICAL) and the delivery half of
> [[BUG-1515]]. Required by [`PLANS.md`](../../PLANS.md) as a **cross-module
> feature** — it changes a contract in `notifications`, inverts a dependency
> with `platform-communications`, and alters which provider sends mail for
> callers in `auth`, `tenants` and `super-admin`.
>
> The owner's rule, stated 2026-08-27: **"Any email generating from Platform
> should use the Platform Email config."** Two follow-up decisions were taken
> the same day and are binding here:
>
> 1. Tenant-generated email with no tenant provider **also** falls back to the
>    platform provider, rather than failing.
> 2. Platform-generated email uses the platform provider **even when the tenant
>    has configured its own SMTP**. An activation link from DijiPeople is sent
>    by DijiPeople, never relayed through a customer's server.

CONTEXT_FILES_REQUIRED:
  - `.agent/context/task-completion-contract.md`
  - `.agent/context/branch-model.md`
  - `AGENTS.md` — the `notifications` module is the only route for tenant
    notification and email; the no-duplicate-sources-of-truth rule.

SPECIALIST_AGENTS_REQUIRED:
  - Backend/API — the resolver extraction, the origin contract, the wiring.
  - Security — SMTP credential decryption moves module; confirm no secret
    reaches a log, a response or an audit snapshot.
  - QA — production retest of a real activation email; this is the acceptance
    evidence and cannot be proven by unit tests.

DELIBERATELY_NOT_USED:
  - Database — no schema change and no migration. The platform provider is a
    `PlatformSetting` row that already exists.
  - Frontend — no UI change. The admin Settings → Email screen already writes
    the row this plan starts reading.

SINGLE_WRITER_FILES:
  - `services/api/src/modules/notifications/email/email-provider-factory.service.ts`
  - `services/api/src/modules/platform-communications/platform-email-settings.service.ts`

QA_REQUIRED: yes

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - `docs/qa/known-bug-patterns/doc-code-drift.md` — `render.yaml` declares
    `EMAIL_*` that production never had. This plan removes the dependency on
    that declaration rather than repairing it.

REGRESSION_ENTRIES_IN_SCOPE:
  - REG-nnn — a production `NODE_ENV` with no tenant provider and no `EMAIL_*`
    must still resolve a provider once platform email is configured.

---

## Objective

Make the platform email configuration — the one an operator maintains at admin
Settings → Email — the provider that actually sends platform-originated mail,
and the fallback for tenant mail that has nowhere else to go.

## Business requirement

Every paid signup currently provisions a tenant whose owner can never sign in.
The activation link is the only way in and it is never delivered. This is the
last blocker on self-service revenue converting into a usable workspace.

## Existing behavior

`EmailProviderFactory.resolveProvider(tenantId)` tries, in order:

1. `EmailProviderSetting` rows for that tenant — nothing in provisioning
   creates one, so a new tenant has none;
2. `fromEnvironment()` — returns `null` unless `EMAIL_PROVIDER` is set;
3. the console provider, guarded by `NODE_ENV !== 'production'`.

Production has no fourth option, so it returns `null` and
`EmailExecutionService` writes an `EmailDeliveryLog` row with
`status: FAILED`, `errorMessage: "No enabled email provider is configured."`,
`retryable: false`, `failureCategory: CONFIGURATION`.

Meanwhile a working SMTP provider **is** configured, in
`PlatformSetting['email-provider']`, and delivers platform mail. The two stores
never meet: `grep platformSetting services/api/src/modules/notifications/`
returns nothing.

## Existing architecture

`ResolvedEmailProvider.source` is already typed
`'tenant' | 'platform' | 'env' | 'dev-fallback'`. **Nothing produces
`'platform'`.** The seam this plan fills was designed and never wired.

`PlatformEmailSettingsService.resolveProvider()` already returns a fully formed
`ResolvedEmailProvider` with `source: 'platform'`. It cannot simply be injected
into the notifications path, because `PlatformCommunicationsModule` imports
`NotificationsModule` — the dependency runs the wrong way.

## Requirements

1. An email may declare its origin. Platform-originated mail resolves the
   platform provider and does not consult tenant configuration at all.
2. Tenant-originated mail resolves: tenant's own provider, then the platform
   provider, then environment, then dev console in non-production, then null.
3. One implementation of platform provider resolution. No second copy of the
   settings key, the normalisation or the decryption.
4. A resolution that falls through to null on production raises an operational
   signal, not only a log row.
5. `source` is recorded on every delivery log so an operator can see which
   provider sent a message.

## Dependencies

None external. Does not depend on the Render `EMAIL_*` variables — removing
that dependency is a goal, not a side effect.

## Files / modules affected

**New**

- `services/api/src/modules/notifications/email/platform-email-provider.resolver.ts`
- `services/api/src/modules/notifications/email/platform-email-provider.resolver.spec.ts`

**Changed**

- `email-provider-factory.service.ts` — origin-aware resolution
- `email-execution.service.ts` — pass origin, record `source`, signal on null
- `notifications.module.ts` — provide the resolver and `SecretEncryptionService`
- `platform-email-settings.service.ts` — delegate `resolveProvider()` to the
  new resolver; keep settings CRUD, validation and the test-send
- `user-invitations.service.ts` — mark activation and invitation mail
  `PLATFORM`
- Callers in `tenants` and `super-admin` that send provisioning mail

## Database impact

None. No schema change, no migration. Reads an existing `PlatformSetting` row.

## Backend impact

Add to `SendTemplateEmailInput`:

```ts
/*
 * Who is sending, not who it is about. A tenant id says which workspace the
 * message concerns; it does not say whether DijiPeople or the tenant is the
 * sender. Activation links are issued by the platform during provisioning and
 * must go out over the platform's own relay — a tenant that has not finished
 * onboarding has no working SMTP, and one that has should not be relaying our
 * account-security mail. Defaults to TENANT so every existing caller keeps its
 * current behaviour.
 */
origin?: 'PLATFORM' | 'TENANT';
```

Resolution becomes:

```
origin = PLATFORM  ->  platform provider, then env, then dev, then null
origin = TENANT    ->  tenant rows, then platform, then env, then dev, then null
```

**Dependency inversion.** Move provider *resolution* into `notifications`,
which owns email delivery, and leave the settings screen's CRUD in
`platform-communications`. `PlatformEmailSettingsService.resolveProvider()`
becomes a one-line delegation, so there is exactly one implementation and the
existing module direction is preserved. `forwardRef` is rejected: the
`NotificationsModule` and `WorkflowsModule` `forwardRef` already in this
codebase is a cost, not a precedent to extend.

The resolver needs `PrismaService`, `SecretEncryptionService` and
`EmailProviderFactory.getProvider()`. None of those live in
`platform-communications`, so the move introduces no new coupling.

**Recursion guard.** `PlatformEmailSettingsService.resolveProvider()` currently
falls back to `providers.resolveProvider('platform')` — the literal string used
as a tenant id. Once the factory can call the platform resolver, that path
would recurse. The platform resolver must call only the base tenant
resolution, and a test must pin it.

## Frontend impact

None.

## Permission / RBAC impact

None. No new keys, no decorator change, no elevated-role involvement. Origin is
set by the calling service and never accepted from a request body — the global
`ValidationPipe` runs `forbidNonWhitelisted`, and `origin` must not appear on
any request DTO.

## Tenant-isolation impact

Reviewed carefully; this is the one place the change could do harm.

- Tenant provider lookup stays scoped by `tenantId`. Unchanged.
- The platform provider is deliberately cross-tenant: it is DijiPeople's own
  relay. It carries no tenant data and grants no tenant read.
- `EmailDeliveryLog` rows stay written under the tenant they concern, so a
  tenant still sees only its own delivery history.
- The recipient address continues to come from the invited user's record, never
  from the provider configuration. Sending as `notifications@dijipeople.com`
  must not change who a message is addressed to.

## Audit / event / logging impact

- Record `source` on every `EmailDeliveryLog` row.
- **Never log the decrypted SMTP password.** `describeProviderConfiguration`
  already masks; the new resolver must reuse it rather than build its own.
- Raise a platform event when resolution returns null in production. Silence
  here is what let this run undetected: a `CONFIGURATION` failure written to a
  per-tenant log that no screen reads is not an alert.

## Integration impact

Removes the runtime dependency on `EMAIL_PROVIDER` and `EMAIL_SMTP_*`. Those
declarations stay in `render.yaml` as a valid override, but production no
longer needs them set — which is the point, given they were declared there and
never in effect.

## Migration / data compatibility

`origin` is optional and defaults to `TENANT`, so every existing caller is
unchanged. A tenant that has configured its own provider keeps using it for its
own mail. The only behaviour change for such a tenant is that
**platform**-originated mail now leaves via DijiPeople rather than their relay,
which is the decision recorded above.

## Parallel-safe tasks

- `PARALLEL_SAFE` — extract the resolver and its spec.
- `PARALLEL_SAFE` — add `source` to the delivery log write.
- `PARALLEL_SAFE` — the platform event on null resolution.

## Dependency-blocked tasks

- `DEPENDENCY_BLOCKED` — origin-aware factory resolution; needs the resolver.
- `DEPENDENCY_BLOCKED` — delegate `PlatformEmailSettingsService.resolveProvider`.
- `DEPENDENCY_BLOCKED` — mark `auth` and provisioning callers `PLATFORM`.

## Integration tasks

- `INTEGRATION` — production retest: resend the invitation for tenant
  `f959c5ff-c8f2-419b-ae79-e99989557771` and confirm
  `activationEmailStatus: SENT` and an email actually arriving.

## Testing strategy

Commands from `AGENTS.md` only:

```bash
DATABASE_URL="postgresql://u:p@localhost:5432/dummy" \
  npm --workspace api run test -- --testPathPatterns="notifications|platform-communications"
npm --workspace api run check-types
npm --workspace api run lint
npm run validate:framework
```

Extend `email-provider-factory.service.spec.ts` and
`platform-email-settings.service.spec.ts`. New
`platform-email-provider.resolver.spec.ts` asserts:

- `origin: PLATFORM` resolves the platform provider **even when the tenant has
  an enabled default provider** — the decision above, pinned;
- `origin: TENANT` with no tenant provider resolves the platform provider;
- `origin: TENANT` with a tenant provider resolves the tenant's;
- with platform settings stored but `enabled: false`, resolution continues down
  the chain rather than returning null;
- under `NODE_ENV=production`, no tenant provider and no `EMAIL_*`, resolution
  is non-null once platform email is configured — the exact BUG-1595 condition;
- the `platform` tenant-id path does not recurse;
- no decrypted password appears in any logged or returned configuration.

Every one of these must be mutation-tested: revert the change and confirm the
test fails. A test that passes either way is why this defect survived.

## Risks

1. **Wrong-sender risk — likely, medium impact.** Tenant workflow mail begins
   going out as `notifications@dijipeople.com`. Recipients may find it
   unexpected, and SPF/DKIM alignment is DijiPeople's, not the tenant's.
   *Mitigation:* it is the owner's explicit decision; `source` on every log row
   makes it visible; a tenant configuring its own provider takes precedence
   immediately.
2. **Deliverability and reputation — possible, medium.** All tenant mail on one
   sending domain concentrates bounce and spam reputation.
   *Mitigation:* out of scope here; flagged as a follow-up on per-tenant
   subdomains or a dedicated relay.
3. **Credential exposure — unlikely, high.** Decryption moves module.
   *Mitigation:* reuse `maskSensitiveConfiguration`; Security agent reviews the
   diff; a test asserts no password in serialised output.
4. **Recursion — unlikely, high.** The `platform` sentinel path.
   *Mitigation:* pinned by test, described above.
5. **Regression for tenants with their own provider — unlikely, low.** Guarded
   by the default `origin: TENANT`.

## Rollback considerations

Fully reversible; no migration, no data change. Reverting the commit restores
the previous chain exactly — and restores the outage, so rollback is only
appropriate if the change causes a worse failure than no tenant email at all.

Shipping the API without any frontend change is safe; there is no frontend
change. Setting the `EMAIL_*` variables on Render remains a valid independent
workaround and does not conflict with this plan.

## Definition of Done

- [ ] Platform-originated mail resolves the platform provider, tenant
      configuration notwithstanding.
- [ ] Tenant mail with no tenant provider resolves the platform provider.
- [ ] One implementation of platform resolution; `PlatformEmailSettingsService`
      delegates to it.
- [ ] No `forwardRef` added.
- [ ] `source` recorded on every delivery log row.
- [ ] Null resolution in production raises a platform event.
- [ ] No secret in any log, response or audit snapshot.
- [ ] Specs above written, passing, and mutation-tested.
- [ ] `check-types`, `lint`, targeted `test` and `validate:framework` pass.
- [ ] Production retest: a real activation email arrives and the owner of
      `f959c5ff-…` can sign in.
- [ ] [[BUG-1595]] and [[BUG-1515]] moved out of `TRIAGE_REQUIRED` with the
      resolution recorded.
- [ ] No unrelated changes in the diff.
