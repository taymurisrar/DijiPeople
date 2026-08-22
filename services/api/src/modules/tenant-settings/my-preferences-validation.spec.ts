import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import {
  SettingsContextController,
  UpdateMyPreferencesDto,
} from './settings-context.controller';

/**
 * REG-224 — BUG-0669.
 *
 * `UpdateMyPreferencesDto` was written with the right rules and never
 * referenced. The handler took `@Body() dto: Record<string, unknown>`, which
 * gives the global `ValidationPipe` no metadata to validate against, so
 * `PATCH /settings/my-preferences` accepted any body at all.
 *
 * `normalizePreferences` in the service is an allow-list of four keys, so this
 * was never mass assignment — the exposure was the **values**. An unbounded
 * timezone, locale and date format were persisted as sent, and an invalid
 * timezone reached `new Intl.DateTimeFormat`, which throws a `RangeError` and
 * surfaces as a 500 where 400 is the honest answer.
 *
 * ## Why the wiring test is the important one
 *
 * A DTO's rules can be perfect and still never run. That is the entire defect
 * here, and it is `declared-but-unwired-step`: the declaration reads as cover
 * and the behaviour is absent. So the first test asserts the *parameter type*
 * Nest will hand the pipe — the fact that was wrong — and the rest assert the
 * rules that fact makes reachable.
 */
describe('BUG-0669 — my-preferences validates its body', () => {
  it('declares the DTO as the handler parameter type', () => {
    /*
     * The assertion that fails if anybody reverts the signature to
     * `Record<string, unknown>`. Without it, every rule below could pass while
     * the endpoint remained wide open — which is exactly the state this record
     * was raised for.
     */
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      SettingsContextController.prototype,
      'updateMyPreferences',
    ) as unknown[];

    // Index 1 is the @Body() parameter. Index 0 is @CurrentUser(), whose type
    // is an interface and therefore emits Object — checking the whole array for
    // the absence of Object would fail on that, and prove nothing about the body.
    expect(paramTypes[1]).toBe(UpdateMyPreferencesDto);
  });

  function errorsFor(body: Record<string, unknown>) {
    return validateSync(
      plainToInstance(UpdateMyPreferencesDto, body, {
        enableImplicitConversion: false,
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    );
  }

  it('accepts a well-formed body', () => {
    expect(
      errorsFor({
        timezone: 'Asia/Dubai',
        locale: 'en-AE',
        dateFormat: 'dd/MM/yyyy',
        timeFormat: '24h',
      }),
    ).toEqual([]);
  });

  it('accepts an empty body, because every field is optional', () => {
    // Updating one preference must not require restating the others.
    expect(errorsFor({})).toEqual([]);
  });

  it('refuses an unbounded timezone', () => {
    // The value that was previously written to the row as sent.
    const errors = errorsFor({ timezone: 'x'.repeat(500) });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('timezone');
  });

  it('refuses a time format that is neither 12h nor 24h', () => {
    const errors = errorsFor({ timeFormat: 'half-past' });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('timeFormat');
  });

  it('refuses a non-string where a string is required', () => {
    // Objects and numbers both reached `normalizePreferences` before, where
    // they were dropped silently — the caller was told the update succeeded.
    expect(errorsFor({ locale: { nested: true } })).toHaveLength(1);
    expect(errorsFor({ dateFormat: 42 })).toHaveLength(1);
  });

  it('refuses a field the DTO does not declare', () => {
    // `forbidNonWhitelisted` is how the global pipe is configured, so an
    // unknown field is a 400 rather than a silently ignored key.
    const errors = errorsFor({ preferredLanguage: 'en' });

    expect(errors).toHaveLength(1);
  });
});
