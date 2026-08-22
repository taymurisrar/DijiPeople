import { Prisma } from '@prisma/client';
import { toDisplayString, toErrorMessage } from './display-string';

/**
 * REG-227 — ITEM-0042.
 *
 * `String(value)` on an object gives `[object Object]`. In an error path that
 * is a lost incident: the one artifact left after a production failure says
 * nothing about it. 47 sites did this; the error paths went first.
 *
 * The invariant: **no input produces `[object Object]`.**
 */
describe('toDisplayString', () => {
  it('never produces [object Object], whatever it is given', () => {
    const inputs: unknown[] = [
      {},
      { code: 'P1001' },
      [1, 2, 3],
      new Map([['a', 1]]),
      new Set([1]),
      Object.create(null),
      { nested: { deep: { deeper: true } } },
      () => undefined,
      Symbol('x'),
      new Date('nope'),
    ];

    for (const input of inputs) {
      expect(toDisplayString(input)).not.toContain('[object Object]');
    }
  });

  it('returns an empty string for absence', () => {
    expect(toDisplayString(null)).toBe('');
    expect(toDisplayString(undefined)).toBe('');
  });

  it('passes a string through untouched, including whitespace', () => {
    expect(toDisplayString('already a string')).toBe('already a string');
    expect(toDisplayString('  padded  ')).toBe('  padded  ');
    expect(toDisplayString('')).toBe('');
  });

  it('renders primitives as themselves', () => {
    expect(toDisplayString(42)).toBe('42');
    expect(toDisplayString(0)).toBe('0');
    expect(toDisplayString(false)).toBe('false');
    expect(toDisplayString(10n)).toBe('10');
  });

  it('renders an Error as its message', () => {
    expect(toDisplayString(new Error('boom'))).toBe('boom');
  });

  it('renders a messageless Error as its name, not an empty string', () => {
    // `throw new NotFoundException()` is common, and "Error" beats nothing.
    expect(toDisplayString(new Error())).toBe('Error');
    expect(toDisplayString(new TypeError('   '))).toBe('TypeError');
  });

  it('renders a Date as ISO 8601', () => {
    expect(toDisplayString(new Date('2026-08-22T09:00:00.000Z'))).toBe(
      '2026-08-22T09:00:00.000Z',
    );
  });

  it('says so for an invalid Date rather than throwing', () => {
    expect(toDisplayString(new Date('nope'))).toBe('Invalid Date');
  });

  it('renders a Decimal exactly, never as a lossy float', () => {
    // Money is where this matters most: Number() would round it and
    // [object Object] would lose it entirely.
    const amount = new Prisma.Decimal('12345678901234567890.12');
    expect(toDisplayString(amount)).toBe('12345678901234567890.12');
  });

  it('renders a plain object as JSON', () => {
    expect(toDisplayString({ code: 'P1001', retryable: false })).toBe(
      '{"code":"P1001","retryable":false}',
    );
  });

  it('renders an array as JSON', () => {
    expect(toDisplayString([1, 'two'])).toBe('[1,"two"]');
  });

  it('describes a circular object rather than throwing', () => {
    const circular: Record<string, unknown> = { name: 'loop' };
    circular.self = circular;
    expect(toDisplayString(circular)).toBe('[unserialisable object]');
  });

  it('describes a value JSON cannot represent', () => {
    expect(toDisplayString(() => undefined)).toBe('[function]');
  });

  it('uses a class that defined its own toString', () => {
    class Money {
      toString() {
        return 'PKR 100.00';
      }
    }
    expect(toDisplayString(new Money())).toBe('PKR 100.00');
  });

  it('does not use the inherited toString', () => {
    class Bare {}
    expect(toDisplayString(new Bare())).toBe('{}');
  });
});

describe('toErrorMessage', () => {
  it('is the message of an Error', () => {
    expect(toErrorMessage(new Error('db is down'))).toBe('db is down');
  });

  it('describes a thrown non-Error instead of giving up on it', () => {
    // The case the old `error instanceof Error ? … : String(error ?? '')`
    // handled worst, and the one a driver actually throws.
    expect(toErrorMessage({ code: 'P1001', meta: { host: 'db' } })).toBe(
      '{"code":"P1001","meta":{"host":"db"}}',
    );
  });

  it('falls back when there is nothing to say', () => {
    expect(toErrorMessage(null, 'Unknown error')).toBe('Unknown error');
    expect(toErrorMessage(undefined, 'Unknown error')).toBe('Unknown error');
    expect(toErrorMessage('', 'Unknown error')).toBe('Unknown error');
  });

  it('defaults the fallback to an empty string', () => {
    expect(toErrorMessage(null)).toBe('');
  });
});
