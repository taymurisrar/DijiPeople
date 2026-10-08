import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PlatformRuntimeService } from './platform-runtime.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';

/**
 * Every record command the admin console sends is one this service dispatches.
 *
 * The console sent record commands to the id-less action route with the id in
 * the body; `execute` read only the positional id, so each partner lifecycle
 * command, lead conversion and agreement amendment fell through to
 * 400 "Action <key> is not available for <module>" (EXECPLAN-0055 WP-01).
 *
 * The list of commands comes from `record-actions.contract.json`, which the
 * admin's `record-action-routing.spec.ts` derives from its module registry and
 * must match exactly — the registry itself cannot be imported here. So a
 * command added to the console is held to this suite without anyone listing
 * it twice by hand.
 *
 * Downstream services are mocks that record the id they were handed: the
 * question is whether the action is dispatched for that record, not what the
 * partner, lead or contract service then does with it.
 */

const CONTRACT = JSON.parse(
  readFileSync(join(__dirname, 'record-actions.contract.json'), 'utf8'),
) as Record<string, unknown>;

const MODULES = [
  'partners',
  'leads',
  'contracts',
  'plans',
  'commissions',
] as const;
const RECORD_ID = 'rec-1';

const CASES = MODULES.flatMap((moduleKey) => {
  const actions = CONTRACT[moduleKey];
  if (!Array.isArray(actions))
    throw new Error(`record-actions.contract.json has no "${moduleKey}" list`);
  return (actions as string[]).map((action) => [moduleKey, action] as const);
});

function owner(): AuthenticatedUser {
  return {
    userId: 'platform-owner',
    tenantId: 'platform',
    roleIds: [],
    roleKeys: [],
    permissionKeys: [],
    rolePrivileges: [],
    platform: {
      id: 'p1',
      role: 'PLATFORM_OWNER',
      permissionKeys: ['platform.*'],
    },
  } as unknown as AuthenticatedUser;
}

function buildService() {
  const seen: string[] = [];
  /** A downstream call: notes which record id reached it. */
  const record =
    (idPosition: number) =>
    (...args: unknown[]) => {
      seen.push(String(args[idPosition]));
      return Promise.resolve({ id: args[idPosition] });
    };

  const prisma = {
    partner: {
      findUnique: (query: { where: { id: string } }) =>
        Promise.resolve({ id: query.where.id }),
    },
    partnerInquiry: {
      findFirst: (query: { where: { partnerId: string } }) => {
        seen.push(query.where.partnerId);
        return Promise.resolve({ id: 'inquiry-1' });
      },
    },
  };
  const partners = {
    lifecycleAction: record(0),
    commissionAction: record(0),
  };
  const partnerExperience = {
    activatePartner: record(1),
    qualifyInquiry: () => Promise.resolve({}),
    rejectInquiry: () => Promise.resolve({}),
    sendOnboardingInvitation: record(1),
  };
  const superAdmin = { convertLeadToCustomer: record(1) };
  const contracts = {
    voidContract: record(1),
    terminateContract: record(1),
    createDerivedContract: record(1),
    saveVersion: record(1),
    get: (_user: unknown, id: string) => {
      seen.push(id);
      return Promise.resolve({
        title: 'Agreement',
        currentVersionNumber: 1,
        versions: [{ version: 1, contentHtml: '<p/>', contentText: '' }],
      });
    },
  };

  const service = new PlatformRuntimeService(
    prisma as never,
    {} as never,
    partners as never,
    superAdmin as never,
    {} as never,
    {} as never,
    {} as never,
    contracts as never,
    {} as never,
    partnerExperience as never,
    {} as never,
    {} as never,
  );
  return { service, seen };
}

describe('PlatformRuntimeService.execute — record action dispatch', () => {
  it('has a non-trivial contract to check', () => {
    expect(CASES.length).toBeGreaterThan(10);
  });

  it.each(CASES)(
    '%s %s dispatches for the record on the /:id/actions route',
    async (moduleKey, action) => {
      const { service, seen } = buildService();
      await expect(
        service.execute(owner(), moduleKey, action, {}, RECORD_ID),
      ).resolves.toBeDefined();
      expect(seen).toContain(RECORD_ID);
    },
  );

  it.each(CASES)(
    '%s %s also dispatches when the id arrives in the body of the id-less route',
    async (moduleKey, action) => {
      const { service, seen } = buildService();
      await expect(
        service.execute(owner(), moduleKey, action, { id: RECORD_ID }),
      ).resolves.toBeDefined();
      expect(seen).toContain(RECORD_ID);
    },
  );

  it.each(CASES)(
    '%s %s is refused with no record at all — the id is what dispatches it',
    async (moduleKey, action) => {
      const { service } = buildService();
      await expect(
        service.execute(owner(), moduleKey, action, {}),
      ).rejects.toThrow(`Action ${action} is not available for ${moduleKey}.`);
    },
  );

  it('prefers the route id over a body id', async () => {
    const { service, seen } = buildService();
    await service.execute(
      owner(),
      'partners',
      'start-review',
      { id: 'body-id' },
      RECORD_ID,
    );
    expect(seen).toEqual([RECORD_ID]);
  });
});
