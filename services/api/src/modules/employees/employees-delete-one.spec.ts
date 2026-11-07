import { NotFoundException } from '@nestjs/common';
import { EmployeesController } from './employees.controller';

/** DP-QA-008: a single-id delete that matches nothing must not answer 200. */
describe('EmployeesController.deleteOne', () => {
  const user = { tenantId: 'tenant-a', userId: 'user-1' } as never;
  const id = '5b1f0c3e-7a49-4d2e-9a61-0c1d2e3f4a5b';

  function build(result: Record<string, unknown>) {
    const bulkDelete = jest.fn().mockResolvedValue(result);
    const controller = new EmployeesController(
      { bulkDelete } as never,
      {} as never,
    );
    return { controller, bulkDelete };
  }

  it('answers 404 when nothing matched (unknown id or another tenant)', async () => {
    const { controller, bulkDelete } = build({
      success: false,
      deletedCount: 0,
      message: 'No matching employee records were found.',
    });

    await expect(controller.deleteOne(user, id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(bulkDelete).toHaveBeenCalledWith(user, { ids: [id] });
  });

  it('returns the result unchanged when a record was deleted', async () => {
    const result = { success: true, deletedCount: 1 };
    const { controller } = build(result);

    await expect(controller.deleteOne(user, id)).resolves.toBe(result);
  });
});
