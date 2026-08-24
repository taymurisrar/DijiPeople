# ExecPlan — Forwarded-host trust in tenant web routing

> Written for [[ITEM-0044]] under [[TASK-0005]] WP-07. Required by
> [`PLANS.md`](../../PLANS.md) on two triggers: **architecture change** (a new
> shared abstraction in `packages/config`, replacing a rule that exists twice in
> `services/api`), and the item's own `ArchitectDisposition: PLAN_REQUIRED`,
> recorded because workspace routing is a tenant boundary.

CONTEXT_FILES_REQUIRED:
  - `.agent/context/task-completion-contract.md`
  - `.agent/context/branch-model.md`
  - `docs/architecture/workspace-routing-and-domains.md` — the contract this extends
  - `packages/config/AGENTS.md`
  - `apps/web/AGENTS.md`

SPECIALIST_AGENTS_REQUIRED:
  - Security — the change decides which header may name a workspace.
  - Frontend — `apps/web/proxy.ts` is the only call site that changes behaviour.
  - Backend/API — two existing copies of the trust rule are collapsed into the
    shared one; the API's behaviour must not move.
  - QA — negative proof that a forged header cannot reroute a request.
  - Reviewer, Integrator — mandatory.
DELIBERATELY_NOT_USED:
  - Database — no schema, no migration, no query changes.
  - Release/DevOps — `develop` only; no new deployment step. The one new
    environment variable is optional and already registered for the API.
  - UI/UX — no rendered surface changes.

SINGLE_WRITER_FILES:
  - none. `apps/web/lib/security-keys.ts` is untouched; the change is in
    routing, not in permission keys.

QA_REQUIRED: yes — a tenant-boundary behaviour change.

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - `docs/qa/known-bug-patterns/doc-code-drift.md` — the architecture document
    already states this rule as though it applied everywhere. It applies to the
    API only. That is the defect.

REGRESSION_ENTRIES_IN_SCOPE:
  - REG-053 — notification provider surface (adjacent, not touched)
  - a new entry is added by this plan for the forged-host case.

TARGET_BRANCH:            develop
TARGET_ENVIRONMENT:       LOCAL
DEPLOYMENT_REQUIRED:      no
DEPLOYMENT_COMPONENTS:    web (on the next ordinary release), api (no behaviour change)
DEPLOYMENT_ORDER:         n/a
ROLLBACK_CLASS:           CODE_ONLY
INTEGRATOR_REQUIRED:      yes
RELEASE_DEVOPS_REQUIRED:  no
POST_DEPLOY_QA_REQUIRED:  no
MERGE_STRATEGY:           ref-push to `develop` at the CI-verified SHA
KNOWN_CONCURRENT_WORK:    none touching `apps/web/proxy.ts` or `packages/config`
ENVIRONMENT_DEPENDENCIES: `TRUST_PROXY_HEADERS` gains a second consumer
                          (`apps/web`). Already registered in
                          `docs/environment-variables.md` and `render.yaml`;
                          the documentation row must widen to name the web app.

---

## Objective

`apps/web` must apply the same forwarded-host trust rule the API already
applies, so that a request arriving without a sanitising edge cannot name a
workspace it did not arrive on.

## Business requirement

One deployment serves every tenant hostname. The hostname is the whole of the
routing decision — it selects the workspace, its branding, and which tenant's
session cookies the browser will present next. A header that anyone can set must
not be able to change that answer.

## Existing behavior

**FACT.** `apps/web/proxy.ts:162-164` resolves the request hostname as:

```ts
const classification = classifyHostname(
  request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
);
```

`x-forwarded-host` is preferred unconditionally, on every request, in every
environment. Nothing downstream re-derives the hostname — `resolveWorkspaceForRequest`
is called once, first, and the rest of the proxy consumes its verdict.

**FACT.** The API does not do this. `services/api/src/modules/tenant-domains/request-hostname.ts`
reads the forwarded chain only when `isProxyTrusted(request)` returns true, and
falls back to `Host` otherwise.

**FACT.** `docs/architecture/workspace-routing-and-domains.md:77-81` states the
trusted-proxy rule as a property of the system, under the heading "The Host
header is only trusted behind a declared proxy", and cites `request-hostname.spec.ts`
as its cover. That citation is accurate and the statement is not: the rule holds
in `services/api` and does not hold in `apps/web`.

## Existing architecture

**FACT.** The trust decision exists in two places in `services/api`, and they
are not the same shape:

| Location | Decides | Rule |
|---|---|---|
| `src/main.ts:158-168` (`resolveTrustProxySetting`) | how many hops Express trusts | explicit `TRUST_PROXY_HEADERS`, else `RENDER === 'true' \|\| VERCEL === '1'` → 1, else false |
| `src/common/security/proxy-trust.ts` (`isProxyTrusted`) | whether this request's forwarded headers are believed | explicit `TRUST_PROXY_HEADERS`, else `Boolean(request.app.get('trust proxy'))` |

The second reads the setting the first wrote, so today they agree. `proxy-trust.ts`
carries the reason it was extracted in the first place:

> Two copies of "do we believe `X-Forwarded-*` here?" would be two things to get
> wrong … It is one question, so it has one answer.

**INFERENCE.** That argument is the one this plan follows. `apps/web` is a third
consumer and cannot reach either function — one is a Nest-side module, the other
takes an Express `Request`. Copying the rule into `apps/web` would make three
copies of a security decision, which is precisely what the extracted comment
warns against.

**FACT.** The precedent for where it belongs already exists.
`packages/config/client-ip.js` holds both halves of the client-address contract
for the same reason, stated in its own header: "They must agree, so they live
together rather than in an apps/ helper and a services/api helper that can drift
apart." `@repo/config` is plain JS with no build step and is already imported by
both `apps/web/proxy.ts` and `services/api`.

## Requirements

1. One implementation of "may this request's forwarded host be believed?",
   in `@repo/config`, consuming an environment bag rather than a framework
   request object so every runtime can call it.
2. `apps/web` resolves its request hostname through it.
3. The API's observable behaviour does not change. Its two entry points keep
   their signatures; only the duplicated env rule moves.
4. A forged `x-forwarded-host` on a direct request resolves to `Host`.
5. Behind a declared proxy, the forwarded host still wins — the deployed
   topology must keep working.
6. Failure is closed and silent: an unresolvable workspace produces the
   existing `NOT_FOUND` state, with no tenant enumeration.

## Dependencies

None. No other in-flight session touches these files.

## Files / modules affected

| File | Change |
|---|---|
| `packages/config/forwarded-host.js` | **new** — the shared rule |
| `packages/config/forwarded-host.test.js` | **new** — `node --test` |
| `packages/config/index.js` | re-export |
| `packages/config/index.d.ts` | types |
| `apps/web/proxy.ts` | resolve hostname through the shared rule |
| `apps/web/lib/forwarded-host.spec.ts` | **new** — negative tests at the web boundary |
| `services/api/src/main.ts` | delegate `resolveTrustProxySetting` to the shared rule |
| `services/api/src/common/security/proxy-trust.ts` | delegate the env half |
| `docs/architecture/workspace-routing-and-domains.md` | state where the rule now lives and that it covers both surfaces |
| `docs/environment-variables.md` | `TRUST_PROXY_HEADERS` gains the web consumer |

Ten files, of which four are documentation or tests.

## Database impact

None. No schema change, no migration, no query change.

## Backend impact

A pure refactor. `resolveTrustProxySetting` and the env half of `isProxyTrusted`
are replaced by calls into `@repo/config`, with the rule reproduced exactly:
explicit values `0/false/no/off` → false; a positive integer → that many hops;
`1/true/yes/on` → 1; any other non-empty value → false; unset → `RENDER === 'true'`
or `VERCEL === '1'` → 1, else false.

`proxy-trust.ts` keeps its Express fallback, because only the API has an Express
app to ask, and that fallback is what makes the two API entry points agree.

## Frontend impact

`apps/web/proxy.ts` changes one expression. The middleware runs on every request,
so the resolution must stay synchronous and allocation-light; the shared function
reads two env values and one header.

Next.js 16 names the middleware `proxy.ts` by convention — nothing imports it,
which is why a grep for its callers finds none.

## Permission / RBAC impact

None. No permission key, matrix entry or access level changes.

## Tenant-isolation impact

This is the point of the change. Today a request that reaches the Next.js server
without a sanitising edge can present `x-forwarded-host: victim.dijipeople.com`
and have the proxy classify it as that workspace. After the change the header is
ignored unless the deployment has declared a proxy in front.

**INFERENCE, stated as a limit rather than a reassurance.** The practical
exposure on the current deployment is low: `apps/web` runs on Vercel, whose edge
overwrites `x-forwarded-host`, so the header is already trustworthy *there*.
What the change removes is the dependence on that being true — a direct origin
request, a preview deployment reached by its own URL, or a future move off
Vercel each break the assumption silently. API authorization still scopes data
by the JWT's `tenantId`, so this is a routing, branding and discovery boundary,
not a data-access one. That is why the item is MEDIUM and not CRITICAL.

## Audit / event / logging impact

None. A refused hostname already produces the `NOT_FOUND` workspace state; no
new log line is added, and the rejected header is not echoed anywhere.

## Integration impact

None. The gateway, Stripe, email and device connectors are untouched.

## Migration / data compatibility

None.

## Parallel-safe tasks

- `PARALLEL_SAFE` — write `packages/config/forwarded-host.js` and its `node --test`.
- `PARALLEL_SAFE` — the two documentation updates.

## Dependency-blocked tasks

- `DEPENDENCY_BLOCKED` on the shared module existing — the `apps/web` call site,
  the `apps/web` spec, and both API delegations.

## Integration tasks

- `INTEGRATION` — repository typecheck, because the change crosses three
  workspaces.

## Testing strategy

**`packages/config/forwarded-host.test.js`** (`node --test`) covers the rule
itself: each explicit value, the hop integer form, the platform inference for
Render and Vercel, and the unset default of false.

**`apps/web/lib/forwarded-host.spec.ts`** (jest) covers the boundary the item
asks for, against the real `classifyHostname`:

- a forged forwarded host on an untrusted request resolves to `Host`
- a forged forwarded host naming a *valid* workspace still resolves to `Host` —
  the case that matters, since the attacker picks a real tenant
- behind a declared proxy the forwarded host wins
- `TRUST_PROXY_HEADERS=false` overrides platform inference
- a missing `Host` with a forwarded header present yields no workspace

**Not written:** a test that boots Next.js middleware. `proxy.ts` is not
importable under the app's jest config without the Next runtime, and the logic
under test is the resolver it calls, which is directly importable.

Commands: `npm run test:runtime-schema` scope for config, `npm --workspace web run test`,
`npm --workspace api run test`, `npm run typecheck`, `npm run lint`.

## Risks

| Risk | Handling |
|---|---|
| The API's trust behaviour moves during the refactor | The rule is reproduced case for case and covered by the config test; `request-hostname.spec.ts` and `client-ip.spec.ts` already pin the API side and must keep passing unchanged. |
| The web deployment stops resolving workspaces | Vercel sets `VERCEL=1`, which the inference reads, so the deployed behaviour is unchanged. Verified against `render.yaml` and the existing API inference rather than assumed. |
| A future runtime sets neither variable | Fails closed to `Host`, which is the correct direction for a routing decision, and is fixable with one environment variable. |

## Rollback considerations

`CODE_ONLY`. Reverting the commit restores the previous behaviour with no data,
schema or configuration state to unwind.

## Definition of Done

- The shared rule exists in `@repo/config` and is the only env-based
  implementation in the repository.
- `apps/web` resolves its hostname through it.
- A forged forwarded host cannot select a workspace on an untrusted request,
  proven by a failing-before test.
- The API's specs pass unchanged.
- `docs/architecture/workspace-routing-and-domains.md` describes where the rule
  lives and which surfaces it covers.
- [[ITEM-0044]] is `DONE` with a regression entry naming the test.
