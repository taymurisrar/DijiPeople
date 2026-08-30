# QA Run — tenant-activation

## Metadata

| | |
|---|---|
| Date / time | 2026-08-22T12:58:31.440Z |
| Branch | `agent/qa-verify-and-burndown` |
| Commit SHA | `be0fd003c644584d26e86b67e13a51881de226f8` |
| Worktree | `D:\My Work\hrm-dijipeople\dijipeople-qa` |
| Environment | Working tree dirty: the suite this run executes (`services/api/test/tenant-activation.e2e-spec.ts`) and its records were uncommitted at run time, and are committed immediately after. Database: a throwaway PostgreSQL migrated from `schema.prisma`; the populated development database was not touched. External services: none — no Stripe, no email, no DNS. |
| QA agent | qa |
| Scope | The successful tenant activation path, end to end: the routing gate, activation to `ACTIVE`, owner sign-in before and after, the audit entry, and all eight tenant tabs. **Not covered:** browser rendering of those tabs, activation reached from a real provisioning run rather than a fixture, and anything downstream of sign-in. |

## Requirement

[[ITEM-0004]] — *"Tenant activation to ACTIVE has never been reached in any
test."* The commercial onboarding E2E of 2026-08-15 proved five activation
**gates** (A16.01–A16.05) and never reached a successful activation, because
[[BUG-0015]] stranded the test tenant with no owner. Its verdict table recorded
`TENANT_PROVISIONING = FAIL`, and its Known Limitations named what remained: the
successful activation path, post-activation owner and session behaviour, and the
eight-tab tenant verification it had planned as A17.

This run walks that path. No ExecPlan: no schema change, no contract change, and
no production code change.

## Risk Areas

- **`assertion-that-cannot-fail`** — the failure mode this run is most exposed
  to. `Tenant.status` defaults to `ACTIVE` in the schema, so a fixture taking the
  default would "reach ACTIVE" without anything having happened. The tenant is
  explicitly moved to `PENDING_SETUP` first.
- **`declared-but-unwired-step`** — an endpoint that returns the requested status
  without writing it. The state is read back from the row, not the response.
- **Regression register** — REG-032 (session revocation), REG-071 (public rate
  limiting, which both login endpoints sit behind), and the tenant-control-plane
  entries. Re-checked below.
- **Shared state** — the routing gate reads one platform setting,
  `tenant-provisioning`. A run that left it changed would alter the next suite's
  preconditions.

## Scenarios

Expected behaviour written **before** execution.

| ID | Scenario | Type | Expected | Result | Evidence |
|---|---|---|---|---|---|
| T1 | Activation refused while the workspace has no address | negative | 400 naming the routing blocker; tenant not `ACTIVE` | PASS | `refuses activation while the workspace has no address` |
| T2 | Owner refused a sign-in while the tenant is not `ACTIVE` | permission | ≥ 400 | PASS | `refuses the owner a sign-in while the tenant is not active` |
| T3 | Activation succeeds once owner and address exist | happy | < 400; row reads `ACTIVE` with the operator's reason | PASS | `activates once the workspace has an owner and an address` |
| T4 | Owner signs in after activation | happy | < 400; owner email, tenant id and an access token | PASS | `lets the owner sign in once the tenant is active` |
| T5 | The activation is in the audit trail | contract | `TENANT_LIFECYCLE_CHANGED` naming `ACTIVE` | PASS | `records the activation in the audit trail` |
| T6.1–T6.10 | All eight tenant tabs serve data | UI-state | each endpoint < 400 with a body | PASS | `serves the $tab tab for the activated tenant`, 10 cases |
| T7 | No owner or reachability blocker stands after activation | happy | empty | PASS | `leaves no reachability blocker standing after activation` |
| T8 | A tenant reaches `ACTIVE` with nothing a user can open | negative | the `modules` blocker still stands — **observed, not endorsed** | PASS | `activates a workspace that still has nothing a user can open` |

T8 is the finding. It asserts current behaviour deliberately; see **Bugs Found**.

## Automated Suites

| Command | Suite | Pass | Fail | Skip | Duration |
|---|---|---|---|---|---|
| `npx jest --config ./test/jest-e2e.json --runTestsByPath test/tenant-activation.e2e-spec.ts` | tenant-activation | 17 | 0 | 0 | ~17s |

### Regression-test proof

The routing gate was disabled in `changeStatus`
(`if (false && routingBlockers.length)`) and the suite re-run:

| Test | With gate | Without gate |
|---|---|---|
| `refuses activation while the workspace has no address` | PASS | **FAIL** |
| `refuses the owner a sign-in while the tenant is not active` | PASS | **FAIL** |
| `activates once the workspace has an owner and an address` | PASS | **FAIL** |

Three, not one, and the third is the interesting one: with the gate gone the
tenant activates during T1, so by T3 it is already `ACTIVE` and the transition is
refused as a repeat. The probe's value is not that it failed — it is that it says
which assertions are load-bearing.

## Manual Validation

None, deliberately. The reason [[ITEM-0004]] stayed open is that its predecessor
was a manual run nobody could repeat. This one runs in CI on every push.

The eight tabs are verified at the endpoint that feeds each panel rather than in
a browser. That is stated as a limitation below rather than glossed.

## Regression Checks

| Regression ID | Scenario | Result |
|---|---|---|
| REG-032 | Sign-out revokes the session and does not 500 | PASS — re-run with `jest --testPathPatterns "auth|logout|session"`, 16 suites, 173 tests |
| REG-221 | Sign-out with no refresh cookie revokes the persisted session | PASS — 6 tests, same session |
| REG-220 | Erasing one tenant leaves every other tenant complete | PASS — 5 tests |
| REG-071 | Public write rate limiting | Not re-run. Both login endpoints sit behind `PublicRateLimitGuard`; this suite makes three sign-in calls against a limit of 20 per address per path, so it neither exercises nor perturbs the limiter. |

## Bugs Found

| ID | Severity | Description | Bug pattern | Regression test added |
|---|---|---|---|---|
| [[ITEM-0079]] | LOW | A tenant activates while readiness still reports `modules` as a `BLOCKER` — *"No module is enabled, so the workspace has nothing a user can open."* The owner then signs in successfully and lands somewhere empty. | `partial-gate` | Yes — pinned by T8 |

The activation gate reasons about two ways a workspace can be live and useless,
and its own comments say so: one nobody can administer, one nobody can reach.
Readiness names a third, and the gate does not check it.

Raised as `PRODUCT_DECISION` rather than as a bug. The gap is established; what
the platform should refuse to do on an operator's behalf is a product call, and
extending the gate could block legitimate activations where modules are enabled
afterwards. **QA does not prioritise.**

It is visible here because this suite's fixture plan entitles no modules. In an
ordinary provisioning run the plan entitles something and the blocker never
appears — which is why nobody would find this by using the product, and why T8
pins it rather than leaving a note. If the gate is later extended, T8 fails and
names the item.

## Known Limitations

- **No browser.** The eight tabs are verified at the control-plane endpoint each
  panel reads, not by rendering. A17 as originally planned would additionally
  prove the panels paint; it would prove nothing further about the tenant.
- **A fixture tenant, not a provisioning run.** The tenant is assembled directly
  — customer account, tenant, organization, business unit, subscription, owner,
  role — rather than produced by `TenantProvisioningRunService`. The activation
  path is proven; the path *into* it from a real self-service purchase is covered
  separately and incompletely — see [[ITEM-0078]], which holds the Stripe half.
- **Nothing downstream of sign-in.** The owner receives tokens; what they then
  see in `apps/web` is not exercised here.
- **The fixture plan entitles no modules**, which is what exposed [[ITEM-0079]]
  and is not representative of a provisioned tenant.

## Final QA Verdict

**PASS**

The claim [[ITEM-0004]] asked for is now evidenced rather than assumed: a tenant
reaches `ACTIVE` through the real endpoint as a real signed-in operator, the row
says so, the owner who was refused a sign-in a moment earlier is admitted, the
change is audited, and every one of the eight tenant tabs answers for that
tenant. The gate immediately preceding the success was re-driven and proven
load-bearing by mutation.

The one finding is recorded, classified and pinned by a test rather than absorbed
into this paragraph. It does not qualify the verdict on the scenarios that ran,
and it is not something this run should decide.

## Follow-up

- [[ITEM-0079]] — Architect and product: should activation gate on a workspace
  having any module enabled? Three options are written up in the record. If the
  answer is yes, T8 inverts.
- [[ITEM-0078]] — the Stripe test-mode half of the commercial journey, which
  would let a future run start at "the customer paid" rather than at a fixture.
- A browser pass over the eight tabs remains worthwhile for what it uniquely
  proves — that the panels render what the endpoints return — but is not what
  [[ITEM-0004]] was blocked on.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Scenarios and records this run exercised, cited in its own body:

[[BUG-0015]] · [[ITEM-0004]] · [[ITEM-0078]] · [[ITEM-0079]]

<!-- GRAPH:END -->
