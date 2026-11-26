import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { assertWorkItemLinks } from './timesheet-workflow.service';

/*
 * DP-MASTER WP-06.S3. A timesheet entry's taskId may name a work item. It stays
 * free text for tenants that already use it that way; only a real work item id is
 * a link, and a link must be to work the employee owns or shares.
 */
const ME = 'emp-me';
const WORK_ITEM = '3f1c1a52-4b1e-4a77-9a39-0f5d0a1c9a10';
const OTHER_ITEM = '7d8e2b63-5c2f-4b88-8b4a-1a6e1b2d0b21';

function tx(
  items: Array<{
    id: string;
    projectId?: string | null;
    ownerEmployeeId?: string | null;
    archivedAt?: Date | null;
    mine?: boolean;
  }>,
) {
  return {
    workItem: {
      findMany: jest.fn().mockResolvedValue(
        items.map((item) => ({
          id: item.id,
          projectId: item.projectId ?? null,
          ownerEmployeeId: item.ownerEmployeeId ?? null,
          archivedAt: item.archivedAt ?? null,
          contributors: item.mine ? [{ employeeId: ME }] : [],
        })),
      ),
    },
  } as unknown as Prisma.TransactionClient;
}

describe('assertWorkItemLinks', () => {
  it('leaves free-text tasks alone and does not even query for them', async () => {
    const t = tx([]);
    await assertWorkItemLinks(t, 'tenant', ME, [
      { taskId: 'Fix the printer' },
      { taskId: null },
      { taskId: '   ' },
    ]);
    expect(t.workItem.findMany).not.toHaveBeenCalled();
  });

  it('ignores an id that is not a work item of the tenant', async () => {
    await expect(
      assertWorkItemLinks(tx([]), 'tenant', ME, [{ taskId: WORK_ITEM }]),
    ).resolves.toBeUndefined();
  });

  it('accepts work the employee owns or shares', async () => {
    await expect(
      assertWorkItemLinks(
        tx([
          { id: WORK_ITEM, ownerEmployeeId: ME },
          { id: OTHER_ITEM, mine: true },
        ]),
        'tenant',
        ME,
        [{ taskId: WORK_ITEM }, { taskId: OTHER_ITEM }],
      ),
    ).resolves.toBeUndefined();
  });

  it('refuses work that belongs to someone else, with a code', async () => {
    await expect(
      assertWorkItemLinks(
        tx([{ id: WORK_ITEM, ownerEmployeeId: 'someone-else' }]),
        'tenant',
        ME,
        [{ taskId: WORK_ITEM }],
      ),
    ).rejects.toMatchObject({
      response: { code: 'TIMESHEET_WORK_ITEM_NOT_YOURS' },
    });
  });

  it("refuses archived work even when it is the employee's", async () => {
    await expect(
      assertWorkItemLinks(
        tx([{ id: WORK_ITEM, ownerEmployeeId: ME, archivedAt: new Date() }]),
        'tenant',
        ME,
        [{ taskId: WORK_ITEM }],
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a project that disagrees with the work item, and accepts one that agrees', async () => {
    const items = [{ id: WORK_ITEM, ownerEmployeeId: ME, projectId: 'p1' }];
    await expect(
      assertWorkItemLinks(tx(items), 'tenant', ME, [
        { taskId: WORK_ITEM, projectId: 'p2' },
      ]),
    ).rejects.toMatchObject({
      response: { code: 'TIMESHEET_WORK_ITEM_PROJECT' },
    });
    await expect(
      assertWorkItemLinks(tx(items), 'tenant', ME, [
        { taskId: WORK_ITEM, projectId: 'p1' },
        { taskId: WORK_ITEM },
      ]),
    ).resolves.toBeUndefined();
  });
});
