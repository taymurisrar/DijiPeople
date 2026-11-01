import type { PrismaClient } from '@prisma/client';
import {
  seedProjectRoles,
  seedTenantInAppNotificationTemplates,
  seedTenantNotificationPreferences,
  seedTenantNotificationRules,
  seedTenantNotificationSettings,
  seedTenantSessionPolicyDefaults,
  seedTenantWorkforceReferenceData,
} from '../../../prisma/seed-config';

/*
 * DP-QA-039 - `seed:config` runs on every deploy. Every seed below writes data a
 * tenant can edit afterwards (notification switches and wording, working-time
 * schedules, locations, designations), so each must be CREATE-ONLY: an existing
 * row keeps whatever the tenant chose. The earlier upserts rewrote their rows on
 * every run, so a tenant that had turned e-mail off had it turned back on at the
 * next release.
 *
 * The recording client captures every upsert so the property is checked for the
 * whole function, including rows added to it later, not for one named column.
 */
function recordingClient() {
  const upserts: Array<{ model: string; update: unknown }> = [];
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_target, method: string) => async (args: any) => {
          if (method === 'upsert') {
            upserts.push({ model: name, update: args.update });
          }
          if (method === 'count') return 0;
          if (method === 'findMany') return [];
          return { id: `${name}-id`, count: 0 };
        },
      },
    );
  const client = new Proxy(
    {},
    { get: (_target, name: string) => model(name) },
  ) as unknown as PrismaClient;
  return { client, upserts };
}

const TENANTS = [{ id: 'tenant-1', name: 'Acme' }] as never;

describe('seed:config preserves tenant-edited configuration (DP-QA-039)', () => {
  const cases: Array<[string, (client: PrismaClient) => Promise<unknown>]> = [
    [
      'notification preferences',
      (c) => seedTenantNotificationPreferences(c, TENANTS),
    ],
    [
      'notification settings',
      (c) => seedTenantNotificationSettings(c, TENANTS),
    ],
    [
      'in-app notification templates',
      (c) => seedTenantInAppNotificationTemplates(c, TENANTS),
    ],
    ['notification rules', (c) => seedTenantNotificationRules(c, TENANTS)],
    [
      'session policy defaults',
      (c) => seedTenantSessionPolicyDefaults(c, TENANTS),
    ],
    ['project roles', (c) => seedProjectRoles(c, 'tenant-1')],
    [
      'workforce reference data (calendar, schedule, shift, location, designations, levels)',
      (c) => seedTenantWorkforceReferenceData(c, TENANTS[0]),
    ],
  ];

  it.each(cases)('%s: every upsert is create-only', async (_label, run) => {
    const { client, upserts } = recordingClient();

    await run(client);

    expect(upserts.length).toBeGreaterThan(0);
    for (const { model, update } of upserts) {
      // `update: {}` means "leave an existing row exactly as the tenant left it".
      expect({ model, update }).toEqual({ model, update: {} });
    }
  });
});
