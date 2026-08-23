import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { CreatePlanPriceDto } from './dto/create-plan-price.dto';
import { UpdatePlanPriceDto } from './dto/update-plan-price.dto';

/**
 * The bodies Platform Admin's price manager actually sends.
 *
 * The global `ValidationPipe` runs with `whitelist`, `transform` and
 * **`forbidNonWhitelisted: true`**, so a property the DTO does not declare
 * rejects the whole request with a 400. That makes the browser payload and the
 * DTO one contract across two workspaces, with nothing in the type system
 * holding them together.
 *
 * They came apart. `PlanPriceManager` built one payload for both endpoints and
 * included `syncToStripe`, which `CreatePlanPriceDto` declares and
 * `UpdatePlanPriceDto` does not. Creating a price worked. Editing one returned
 * `property syncToStripe should not exist` — every time, for every field, on
 * every plan.
 *
 * It went unnoticed because the Pricing tab had been filtered out of the plan
 * record page entirely (BUG-0794), so nothing could reach the panel to submit
 * the form. Restoring the tab is what made the panel reachable, and a
 * reachable screen is where its bugs finally surface. A test that the tab
 * *renders* proved nothing about whether it *works*.
 *
 * These cases run the real validator over the real payload shapes.
 * `plan-price-payload.spec.ts` in the admin workspace guards the other side —
 * that the component keeps sending these shapes.
 */
describe('plan price DTOs accept what Platform Admin sends', () => {
  /** Fields common to both endpoints, exactly as `toBasePayload` builds them. */
  const basePayload = {
    billingCycle: 'MONTHLY',
    currency: 'QAR',
    unitAmount: 14,
    billingModel: 'PER_SEAT',
    billingInterval: 'MONTH',
    minimumSeats: 25,
    maximumSeats: null,
    includedSeats: 0,
    stripePriceId: null,
    isActive: true,
  };

  function errorsFor<T extends object>(
    cls: new () => T,
    payload: Record<string, unknown>,
  ) {
    const instance = plainToInstance(cls, payload, {
      enableImplicitConversion: true,
    });
    // `forbidNonWhitelisted` is what turns an undeclared property into a 400,
    // and it is the behaviour under test — not a detail of this harness.
    return validateSync(instance as object, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  }

  it('accepts the create payload, including syncToStripe', () => {
    const errors = errorsFor(CreatePlanPriceDto, {
      ...basePayload,
      syncToStripe: true,
    });
    expect(errors.map((error) => error.property)).toEqual([]);
  });

  it('accepts the update payload', () => {
    const errors = errorsFor(UpdatePlanPriceDto, basePayload);
    expect(errors.map((error) => error.property)).toEqual([]);
  });

  it('rejects syncToStripe on update — the exact 400 that was shipped', () => {
    /*
     * This asserts the *server* is entitled to refuse it, which is why the fix
     * belongs on the client. `updatePlanPrice` needs no flag: a Stripe price is
     * immutable, so a change to amount, currency, interval or billing model
     * supersedes the row through `createPlanPrice` with `syncToStripe: true`
     * hardcoded. The sync already happens on exactly the edits that need one.
     */
    const errors = errorsFor(UpdatePlanPriceDto, {
      ...basePayload,
      syncToStripe: true,
    });
    expect(errors.map((error) => error.property)).toEqual(['syncToStripe']);
  });

  it('accepts a flat price carrying includedSeats', () => {
    /*
     * `includedSeats` is the flat model's field — `FLAT_SCHEDULE` in
     * `pricing.catalog.ts` carries it, `PER_SEAT_SCHEDULE` carries
     * `minimumSeats`. The form had the input disabled on
     * `billingModel === "FLAT"`, so the one model that uses it could not set
     * it. The endpoint always accepted it.
     */
    const errors = errorsFor(UpdatePlanPriceDto, {
      ...basePayload,
      billingModel: 'FLAT',
      includedSeats: 25,
      minimumSeats: 1,
      maximumSeats: null,
    });
    expect(errors.map((error) => error.property)).toEqual([]);
  });
});
