# Incoming regression entries — SESSION-0076, admin/commercial stream

Staged here rather than appended to `../index.md`, because ten concurrent agents
appending to one file conflict on every line. The coordinating session merges
these into the register. Reserved id range for this stream: REG-349 to REG-352.

---

### REG-349 — A count read as an array, on the screen that decides whether a plan can be retired

| | |
|---|---|
| **Bug class** | `shape-disagreement-between-two-readers` |
| **Module** | `apps/admin` runtime, `super-admin` |
| **Bug record** | BUG-1953 |
| **Root cause** | `SuperAdminService.mapPlan` publishes the subscription count twice — as `subscriptionCount` and, deliberately, as `subscriptions`, because `validateRuntimeDefinition` resolves every list column against the Prisma model graph and a computed alias resolves to nothing. Both are numbers. The plan record page read the second with `Array.isArray(form.values.subscriptions) ? form.values.subscriptions.length : 0`, and a number never satisfies that test, so every plan fell through to zero — the value that makes the Overview tile render "No tenant is billed on this plan yet." The Plans list read the same field as a number and showed 2. |
| **Regression test** | `apps/admin/lib/runtime/plan-subscription-count.spec.ts` |
| **Scenario** | `planSubscriptionCount` returns the count for the exact production payload (`{ subscriptions: 2 }`), for the explicit `subscriptionCount` field, and for the relation-array shape `PlatformRuntimeService.findGeneric` genuinely returns for a plan. Zero stays zero; a string, a NaN and a negative are refused rather than coerced. |
| **Proven to fail without the fix** | Mutation-tested: restoring the original inline expression inside the helper fails three of the six assertions, including the production payload. |
| **Note** | Neither reader was miscounting. Two readers of one payload disagreed about its *shape*, and the wrong one failed into a value that reads as a confident factual claim rather than as an error — "no tenant is billed on this plan" is what an operator consults before archiving or repricing a plan. **A wrong answer that is indistinguishable from a legitimate one cannot announce itself.** The array branch is kept rather than simplified away because both shapes really exist in this codebase: the runtime GET for a plan and `findGeneric` return `subscriptions` differently. Same lesson as `planEntitlementKeys` beside it. |
| **Fixed** | 2026-08-29, branch `agent/bugfix-admin` |
| **Active** | yes |

### REG-350 — Two price schedules rendered as one price

| | |
|---|---|
| **Bug class** | `unrelated-rows-presented-as-a-pair` |
| **Module** | `apps/admin` plans, `super-admin` pricing |
| **Bug record** | BUG-1954 |
| **Root cause** | The plan detail tiles looked each billing cycle up independently — `prices.find(p => p.billingCycle === 'MONTHLY' && p.isActive !== false)` and the same for `ANNUAL` — with nothing tying the two rows to one currency or one billing model. Starter carries twelve active `PlanPrice` rows (PKR/QAR/USD x per-seat/flat x monthly/annual), `PlansRepository` orders them `currency asc, billingCycle asc`, and within one currency and cycle the per-seat and flat rows tie. So the monthly tile resolved to PKR per-seat 300 and the annual tile to PKR **flat** 120,000 — 12,000 x 10, a real stored price from the other schedule. The caption followed: 300 x 12 = 3,600 is less than 120,000, the saving clamped to zero, and the tile asserted "No annual discount against monthly billing" for a schedule that encodes two months free. |
| **Regression test** | `apps/admin/lib/runtime/plan-headline-prices.spec.ts` |
| **Scenario** | Starter's real production schedule, in the order the API sends it, must yield PKR 300 against PKR 3,000 and a 17% caption — and explicitly **not** 120,000. Then the same invariant per currency: QAR whole units (8 / 80) and **USD fractional units (2.2 / 22)**, which is the minor-unit case — nothing multiplies or divides by 100 in either direction, and the fractional currency must produce the same 17%. Plus a flat-only plan, deactivated rows, duplicate active rows for one cycle, a dearer annual price clamping to zero saving, and a plan with no priced rows. |
| **Proven to fail without the fix** | Mutation-tested: restoring the two independent lookups fails eight of the fourteen assertions, including the PKR pairing, the explicit "annual is never 120,000" assertion, the discount caption and the QAR case. |
| **Note** | **A single-currency assertion would have passed against the live bug**, which is why the guard walks three currencies and includes a fractional one: PKR and QAR are whole-unit in this schedule, so a rescaling defect would hide in them and only USD 2.2 exposes it. Worth carrying forward on any money surface here. Two things about the diagnosis: the record's arithmetic ("120,000 is not 3,000, not 300 x 12, not 3,000 x 100") was right and led away from the answer, because the number came from a *different row*, not from a transform of the displayed one — when a money figure matches no transform of its neighbour, look for another row before looking for another formula. And the fix necessarily makes a product choice: one headline pair for a twelve-price plan is lossy whichever row it picks, so the tiles now name the schedule they show ("Per seat, PKR") and say how many others exist. Per-seat is preferred over flat because flat rows are `SALES_ASSISTED` and self-service checkout cannot reach them. **No stored price was touched and no seed was run** — `seed:commercial` would have rewritten the live QAR and USD schedules. |
| **Fixed** | 2026-08-29, branch `agent/bugfix-admin` |
| **Active** | yes |

### REG-351 — A provider callback that arrived early, refused as a bad payload

| | |
|---|---|
| **Bug class** | `wrong-status-for-a-race` |
| **Module** | `billing`, `platform-events` |
| **Bug record** | BUG-1543 |
| **Root cause** | A public self-service signup has no tenant until the payment authorises provisioning to create one, and Stripe's `customer.subscription.created` and `invoice.paid` callbacks routinely arrive before provisioning finishes. `resolveSubscriptionContext` and `resolveInvoiceContext` then found nothing to attribute the event to and threw `BadRequestException`, which `HttpExceptionFilter` renders as `400 VALIDATION_FAILED` — the status asserting the *caller* sent something malformed. Each also marked the stored event `FAILED` and recorded a `STRIPE_WEBHOOK_PROCESSED` platform event with result `FAILED`, and the notification rule matching `^STRIPE_WEBHOOK` raises its CRITICAL "a customer may have paid without us knowing" alert on exactly that. Two callbacks, two 400s, one critical alert, on a payment that succeeded. |
| **Regression test** | `services/api/src/modules/billing/services/webhook-event-not-ready.spec.ts` |
| **Scenario** | With an unactivated `SubscriptionOrder` for the event's Stripe customer, `processStripeEvent` answers `INTEGRATION_EVENT_NOT_READY` (409, not 400), names the order number, leaves the stored event `RECEIVED` so Stripe's redelivery reprocesses it, and records the platform event as `IGNORED` so no critical alert fires. With **no** order in flight the same event still fails, still records `FAILED` and still alerts. An unknown Stripe event type is ignored and answered 200. The controller declares no `@Body()`, still takes the raw request and the signature header, and still calls `verifyWebhookSignature`. |
| **Proven to fail without the fix** | Mutation-tested: removing the `assertNotAwaitingProvisioning` call from the subscription resolver fails four of the seven assertions — the status code, the order name, the stored-event state and the alert suppression — while leaving the three controls green. |
| **Note** | **This was not verified against a live Stripe, and could not be from here.** No Stripe API call, price sync, mode change or configuration change was made; the mode stays as the accepted-risk decision on BUG-0903 left it. Specifically unverified: that the two rejections in the 2026-08-26 incident were these two branches rather than a third; that redelivery timing clears the race in practice; and the end-to-end absence of the alert on a real paid signup. The 2026-08-28 diagnostics will name the branch if it recurs. **The suspected cause was wrong and is worth recording as wrong**: the natural theory is the global `ValidationPipe` with `forbidNonWhitelisted` rejecting a field Stripe added, which would be a genuine design error — but this route declares no `@Body()`, so the pipe never sees a Stripe payload, and an unknown event type already falls through to `IGNORED` and a 200. Two deliberate choices went the less obvious way. The response stays a **non-2xx**, because Stripe's redelivery is the only thing that writes the `Invoice` and `Payment` rows for a self-service order — answering 200 would have read better against the record's acceptance criterion and lost them, and is why the original incident lost nothing despite the 400s. And the stored event stays `RECEIVED` rather than `IGNORED`, because `processStripeEvent` short-circuits `IGNORED` as a duplicate and would lose the same rows. Silencing the alert was explicitly the wrong fix; what changed is that a payment which succeeded no longer looks like one that went missing. |
| **Fixed** | 2026-08-29, branch `agent/bugfix-admin` |
| **Active** | yes |

### REG-352 — A validation step that did not run the rules it validated against

| | |
|---|---|
| **Bug class** | `validation-that-does-not-predict-the-operation` |
| **Module** | `platform-runtime`, `super-admin` onboarding |
| **Bug record** | BUG-1548 |
| **Root cause** | `POST /platform-runtime/customer-onboarding/validate` ran `CreateCustomerOnboardingRecordDto` and returned success. `POST /platform-runtime/customer-onboarding` ran the **same DTO** and then nine further checks in `PlatformLifecycleService` — sub-status, customer existence and ownership, an onboarding already active for the customer, unmet customer prerequisites, the service-account pairing, tenant slug validity, and the slug already being taken. Five of the nine produce a 400 and two a 409, which is why the reported "400 case" looked uncharacterised: there was no single 400 to characterise. The divergence was never in the schema. |
| **Regression test** | `services/api/src/modules/platform-runtime/customer-onboarding-validate-agrees-with-create.spec.ts` |
| **Scenario** | Validate in create mode runs the create rule set; the 409 for an already-active onboarding, the unmet-prerequisites 400 and the taken-slug 409 are each reported with create's own wording; a DTO failure still short-circuits before the business rules, so a malformed payload is not reported as a business refusal; update-mode validation is untouched. One structural assertion: each refusal string appears exactly once in the lifecycle service and the create path resolves what it needs from the shared assertion rather than repeating the lookups. |
| **Proven to fail without the fix** | Mutation-tested: removing the `assertCustomerOnboardingCreatable` call from `validate` fails four of the seven assertions and leaves the three controls — the DTO short-circuit, the update-mode case and the structural check — green, which is what they are there for. |
| **Note** | The record's ask was "one validation path rather than two", and the structural assertion is the part that keeps it that way: it is not enough for validate to call the same method today if a tenth check can be added above it tomorrow. `assertCustomerOnboardingCreatable` deliberately includes the sub-status check that `createCustomerOnboarding` performs *before* it delegates — a rule validate skips is a divergence whether it lives one method up or not. The residual divergence is enumerated rather than left implicit: exactly two races (another operator creating an onboarding for the same customer, or claiming the same slug, between validate and save), both refused a moment later by the same checks with the same message. **This makes the two endpoints agree on the reason, not on the field** — these refusals carry a message and no `fieldErrors`, which is BUG-1546's territory and untouched here. |
| **Fixed** | 2026-08-29, branch `agent/bugfix-admin` |
| **Active** | yes |
