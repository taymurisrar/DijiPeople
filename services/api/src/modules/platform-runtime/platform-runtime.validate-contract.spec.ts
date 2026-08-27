/* The DTOs below carry class-validator decorators, which need the polyfill. */
import 'reflect-metadata';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAdminLeadDto } from '../leads/dto/admin-lead.dto';
import { readValidationFailure } from './platform-runtime.service';

/*
 * `POST /platform-runtime/:moduleKey/validate` exists so a runtime form can put
 * a reason under the field that earned it. It answered with the string
 * "Bad Request Exception" instead — the name of the Nest class, not a reason —
 * because an exception built from a payload sets its own `.message` to that
 * constant, and the catch read `.message`.
 *
 * The form was already correct: it reads `validation.errors` as
 * `{ field, message }[]`. The server never sent them, so `errors ?? []` was
 * always empty, every field error was cleared, and the operator was told an
 * exception class name and left to guess which value was wrong. BUG-1422.
 *
 * These tests drive the real function the endpoint returns through, with the
 * real exception `dto()` throws, so deleting the fix fails them.
 */

/** Exactly what `dto()` does on a validation failure. */
async function throwsLikeDto(Class: new () => object, plain: object) {
  const present = Object.fromEntries(
    Object.entries(plain).filter(([, value]) => value !== undefined),
  );
  const instance = plainToInstance(Class, present, {
    enableImplicitConversion: true,
  });
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return new BadRequestException({
    message: errors.flatMap((error) => Object.values(error.constraints ?? {})),
    fieldErrors: errors.map((error) => ({
      field: error.property,
      message:
        Object.values(error.constraints ?? {})[0] ?? 'This value is invalid.',
    })),
  });
}

describe('runtime validation reports which field failed', () => {
  it('names every field that failed', async () => {
    // A lead with no company name and a work email that is not an address.
    const thrown = await throwsLikeDto(CreateAdminLeadDto, {
      companyName: '',
      workEmail: 'not-an-email',
    });

    const result = readValidationFailure(thrown);

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.map((entry) => entry.field)).toContain('workEmail');
    for (const entry of result.errors) {
      expect(entry.field).toEqual(expect.any(String));
      expect(entry.field).not.toHaveLength(0);
      expect(entry.message).toEqual(expect.any(String));
      expect(entry.message).not.toHaveLength(0);
    }
  });

  it('never hands the operator the exception class name as the reason', async () => {
    const thrown = await throwsLikeDto(CreateAdminLeadDto, {
      workEmail: 'nope',
    });

    /*
     * The trap the bug fell into: `.message` on the exception is the class's
     * own name, while the reasons sit on the payload beside it.
     */
    expect(thrown.message).toBe('Bad Request Exception');

    const result = readValidationFailure(thrown);
    expect(result.message).not.toContain('Bad Request Exception');
    expect(result.message).toMatch(/email/i);
  });

  it('still answers for a failure that is not a validation error', () => {
    const result = readValidationFailure(new NotFoundException('Gone.'));
    expect(result.success).toBe(false);
    expect(result.errors).toEqual([]);
    expect(result.message).toBe('Gone.');
  });

  it('answers for something that is not an Error at all', () => {
    const result = readValidationFailure('exploded');
    expect(result).toEqual({
      success: false,
      message: 'Validation failed.',
      errors: [],
    });
  });
});
