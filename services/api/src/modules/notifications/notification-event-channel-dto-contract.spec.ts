import { ValidationPipe } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { UpdateNotificationEventChannelDto } from './dto';

/**
 * CONTRACT — what the notification events page sends must satisfy the DTO
 * that receives it (ITEM-0180).
 *
 * The global ValidationPipe runs with `forbidNonWhitelisted: true`, so the
 * browser payload and `UpdateNotificationEventChannelDto` are one contract
 * across two workspaces with nothing in the type system holding them together.
 * A field added on the web side is a 400 on every toggle — and because the
 * page saves optimistically and rolls back, it would read as "the checkbox
 * will not stay ticked", not as a validation error.
 *
 * The payload shape is read from the web source rather than restated here, so
 * this cannot pass by describing a client that no longer exists. The pipe uses
 * the options `main.ts` uses. `notification-events-model.spec.ts` in apps/web
 * pins the same shape from the other side.
 */

const WEB_ROOT = join(__dirname, '../../../../../apps/web');
const WEB_MODEL = join(
  WEB_ROOT,
  'app/(authenticated)/settings/notifications/_components/notification-events-model.ts',
);
const WEB_CLIENT = join(WEB_ROOT, 'lib/notifications-api.ts');

function squash(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function sliceFrom(text: string, start: string, end: string) {
  const from = text.indexOf(start);
  if (from === -1) return '';
  const to = text.indexOf(end, from + start.length);
  return text.slice(from, to === -1 ? undefined : to + end.length);
}

describe('notification events page request contract', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });

  const validate = (body: unknown) =>
    pipe.transform(body, {
      type: 'body',
      metatype: UpdateNotificationEventChannelDto,
    });

  it('the web page builds exactly { channel, enabled }', () => {
    const model = readFileSync(WEB_MODEL, 'utf8');
    const builder = sliceFrom(
      model,
      'export function buildEventChannelPayload(',
      '}',
    );
    expect(squash(builder)).toContain('return { channel, enabled }');

    // …and that builder is what the optimistic save actually sends.
    const runner = sliceFrom(
      model,
      'export async function runOptimisticToggle(',
      'catch (error)',
    );
    expect(squash(runner)).toContain(
      'buildEventChannelPayload(input.channel, input.enabled)',
    );

    const client = readFileSync(WEB_CLIENT, 'utf8');
    const call = sliceFrom(
      client,
      'export const updateNotificationEventChannel',
      ');',
    );
    expect(squash(call)).toContain('body: JSON.stringify(payload)');
    expect(squash(call)).toContain('/event-settings/${encodeURIComponent(eventCode)}');
  });

  it.each([
    ['IN_APP', true],
    ['IN_APP', false],
    ['EMAIL', true],
    ['EMAIL', false],
  ])('accepts { channel: %s, enabled: %s }', async (channel, enabled) => {
    await expect(validate({ channel, enabled })).resolves.toBeInstanceOf(
      UpdateNotificationEventChannelDto,
    );
  });

  it.each(['PUSH', 'SMS', 'in_app', ''])(
    'refuses channel %p, which nothing sends',
    async (channel) => {
      await expect(validate({ channel, enabled: true })).rejects.toThrow();
    },
  );

  it('refuses an event code or tenant in the body — the event is the URL', async () => {
    await expect(
      validate({ channel: 'EMAIL', enabled: true, eventCode: 'AUTH_OTP' }),
    ).rejects.toThrow();
    await expect(
      validate({ channel: 'EMAIL', enabled: true, tenantId: 'other' }),
    ).rejects.toThrow();
  });

  it('refuses a string "false" and a missing flag', async () => {
    await expect(
      validate({ channel: 'EMAIL', enabled: 'false' }),
    ).rejects.toThrow();
    await expect(validate({ channel: 'EMAIL' })).rejects.toThrow();
  });
});
