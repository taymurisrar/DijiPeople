import { BadRequestException } from '@nestjs/common';
import { TenantStatus } from '@prisma/client';
import { TenantControlPlaneService } from './tenant-control-plane.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';

/**
 * ITEM-0079 — activation warns about an empty workspace rather than refusing it.
 *
 * `changeStatus` refuses activation for two reasons, and its own comments say
 * why each matters: a workspace nobody can administer is one its customer
 * cannot sign in to, and a workspace nobody can reach is one whose owner is
 * told it is live and finds nothing at the address.
 *
 * Readiness names a third — "No module is enabled, so the workspace has nothing
 * a user can open" — and marks it `BLOCKER`, but the gate never checked it.
 *
 * Decided on 2026-08-29: it **warns and allows**. Unlike the other two it is
 * recoverable from inside the product in a minute, and activating ahead of
 * enabling modules is a real workflow.
 *
 * The load-bearing assertion is not that activation succeeds — that is the easy
 * half, and doing nothing at all would satisfy it. It is that the warning
 * actually reaches somebody: the response, the audit entry, and the platform
 * event's severity. A warning nobody receives is just an activation.
 */

function owner(): AuthenticatedUser {
  return {
    userId: 'platform-user',
    tenantId: 'platform',
    platform: { id: 'p1', role: 'PLATFORM_OWNER' },
  } as unknown as AuthenticatedUser;
}

type Check = { key: string; label: string; severity: string; message: string };

const MODULES_BLOCKER: Check = {
  key: 'modules',
  label: 'Modules enabled',
  severity: 'BLOCKER',
  message:
    'No module is enabled, so the workspace has nothing a user can open.',
};

const ROUTING_BLOCKER: Check = {
  key: 'workspace-routing',
  label: 'Routing',
  severity: 'BLOCKER',
  message: 'The workspace host does not resolve.',
};

function build(checks: Check[]) {
  const audits: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  const tenant = {
    id: 'tenant-1',
    status: TenantStatus.PENDING_SETUP,
    subStatus: null,
    customerAccountId: 'cust-1',
  };

  const prisma = {
    tenant: {
      findFirst: () => Promise.resolve(tenant),
      findUnique: () => Promise.resolve(tenant),
      update: () =>
        Promise.resolve({
          id: tenant.id,
          status: TenantStatus.ACTIVE,
          subStatus: 'going live',
        }),
    },
    refreshToken: { updateMany: () => Promise.resolve({ count: 0 }) },
    platformUser: {
      findUnique: () => Promise.resolve({ id: 'p1', email: 'op@x' }),
    },
  };

  const service = new TenantControlPlaneService(
    prisma as never,
    { countActiveOwners: () => Promise.resolve(1) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      log: (input: Record<string, unknown>) => {
        audits.push(input);
        return Promise.resolve(undefined);
      },
    } as never,
    {
      record: (input: Record<string, unknown>) => {
        events.push(input);
        return Promise.resolve(undefined);
      },
    } as never,
  );

  // `readiness` and `overview` are the service's own methods; stubbing them
  // keeps this about the gate rather than about eight collaborators.
  jest.spyOn(service, 'readiness').mockResolvedValue({ checks } as never);
  jest
    .spyOn(service, 'overview')
    .mockResolvedValue({ tenant: { id: tenant.id } } as never);

  return { service, audits, events };
}

const activate = { status: TenantStatus.ACTIVE, reason: 'going live' };

describe('ITEM-0079 — an empty workspace warns, a stranded one refuses', () => {
  it('activates a workspace with no module enabled', async () => {
    const { service } = build([MODULES_BLOCKER]);
    await expect(
      service.changeStatus(owner(), 'tenant-1', activate as never),
    ).resolves.toBeDefined();
  });

  it('tells the operator, on the response', async () => {
    const { service } = build([MODULES_BLOCKER]);
    const result = (await service.changeStatus(
      owner(),
      'tenant-1',
      activate as never,
    )) as { activationAdvisories?: string[] };
    expect(result.activationAdvisories).toEqual([MODULES_BLOCKER.message]);
  });

  it('records it in the audit entry and raises the event to WARNING', async () => {
    const { service, audits, events } = build([MODULES_BLOCKER]);
    await service.changeStatus(owner(), 'tenant-1', activate as never);

    const after = audits[audits.length - 1]?.afterSnapshot as {
      activationAdvisories?: string[];
    };
    expect(after.activationAdvisories).toEqual([MODULES_BLOCKER.message]);
    expect(events[events.length - 1]?.severity).toBe('WARNING');
  });

  it('says nothing when there was nothing to say', async () => {
    /*
     * An empty `activationAdvisories` key would read as "checked and fine",
     * which is a different fact from "not applicable". The field is absent.
     */
    const { service, audits, events } = build([]);
    const result = (await service.changeStatus(
      owner(),
      'tenant-1',
      activate as never,
    )) as Record<string, unknown>;

    expect(result).not.toHaveProperty('activationAdvisories');
    expect(audits[audits.length - 1]?.afterSnapshot).not.toHaveProperty(
      'activationAdvisories',
    );
    expect(events[events.length - 1]?.severity).toBe('INFO');
  });

  it('still refuses a workspace nobody can reach', async () => {
    // The decision was about the third blocker only. The two gates that were
    // already there are unchanged, and this is what proves the change was
    // narrow rather than a general relaxation.
    const { service } = build([ROUTING_BLOCKER]);
    await expect(
      service.changeStatus(owner(), 'tenant-1', activate as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses on routing even when the module warning is also present', async () => {
    const { service } = build([MODULES_BLOCKER, ROUTING_BLOCKER]);
    await expect(
      service.changeStatus(owner(), 'tenant-1', activate as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
