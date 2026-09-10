import { ReportQueryExecutor } from './query-executor';
import type { ReportFieldDefinition } from '../semantic/semantic.types';

/**
 * BUG-3020 — the "Records behind these numbers" drill-down printed raw uuids
 * for Department, Employee, Organization, Business unit and Location on
 * `workforce_history`, while the breakdown chart directly above the same
 * table resolved the same field to a human label. The breakdown's resolver
 * (`resolveLabels`, exercised indirectly through `query()`/`records()`
 * elsewhere) was never wired to the row-listing path — `readFieldValue`
 * returns the raw scalar `path` reads and nothing calls the lookup for it.
 *
 * `resolveFieldLabels` is the fix: the same lookup-table batching strategy,
 * generalised from "one bucket set" to "one page of rows", covered here in
 * isolation so a regression that stops the batch query, or stops excluding
 * nulls, or reverts to per-row queries, fails a fast unit test rather than
 * only a live screenshot.
 */
describe('ReportQueryExecutor.resolveFieldLabels', () => {
  const departmentField: ReportFieldDefinition = {
    key: 'workforce_history.department',
    label: 'Department',
    type: 'string',
    path: 'departmentId',
    reportable: true,
    filterable: true,
    groupable: true,
    groupByField: 'departmentId',
    labelLookup: { model: 'department', valueField: 'id', labelField: 'name' },
    nullLabel: 'Unassigned',
  };

  const plainField: ReportFieldDefinition = {
    key: 'workforce_history.employee_code',
    label: 'Employee code',
    type: 'string',
    path: 'employee.employeeCode',
    reportable: true,
    filterable: true,
  };

  function buildExecutor(findMany?: jest.Mock) {
    const departmentFindMany =
      findMany ??
      jest.fn().mockResolvedValue([
        { id: 'dept-uuid-1', name: 'Engineering' },
        { id: 'dept-uuid-2', name: 'Sales' },
      ]);
    const prisma = { department: { findMany: departmentFindMany } };
    const executor = new ReportQueryExecutor(prisma as never);
    return { executor, departmentFindMany };
  }

  it('resolves raw ids to labels in one batch query', async () => {
    const { executor, departmentFindMany } = buildExecutor();

    const labels = await executor.resolveFieldLabels(departmentField, [
      'dept-uuid-1',
      'dept-uuid-1',
      'dept-uuid-2',
    ]);

    expect(departmentFindMany).toHaveBeenCalledTimes(1);
    expect(labels.get('dept-uuid-1')).toBe('Engineering');
    expect(labels.get('dept-uuid-2')).toBe('Sales');
  });

  it('deduplicates ids before querying — one page must not be one query per row', async () => {
    const { executor, departmentFindMany } = buildExecutor();

    await executor.resolveFieldLabels(departmentField, [
      'dept-uuid-1',
      'dept-uuid-1',
      'dept-uuid-1',
    ]);

    const [{ where }] = departmentFindMany.mock.calls[0];
    expect(where.id.in).toEqual(['dept-uuid-1']);
  });

  it('excludes null and undefined values from the lookup query', async () => {
    const { executor, departmentFindMany } = buildExecutor();

    await executor.resolveFieldLabels(departmentField, [
      null,
      undefined,
      'dept-uuid-1',
    ]);

    const [{ where }] = departmentFindMany.mock.calls[0];
    expect(where.id.in).toEqual(['dept-uuid-1']);
  });

  it('returns an empty map without querying when every value is null', async () => {
    const { executor, departmentFindMany } = buildExecutor();

    const labels = await executor.resolveFieldLabels(departmentField, [
      null,
      undefined,
    ]);

    expect(departmentFindMany).not.toHaveBeenCalled();
    expect(labels.size).toBe(0);
  });

  it('returns an empty map for a field with no labelLookup, without querying', async () => {
    const { executor, departmentFindMany } = buildExecutor();

    const labels = await executor.resolveFieldLabels(plainField, [
      'anything',
    ]);

    expect(departmentFindMany).not.toHaveBeenCalled();
    expect(labels.size).toBe(0);
  });

  it('omits an id the lookup table no longer has — a deleted department', async () => {
    const { executor } = buildExecutor(
      jest.fn().mockResolvedValue([{ id: 'dept-uuid-1', name: 'Engineering' }]),
    );

    const labels = await executor.resolveFieldLabels(departmentField, [
      'dept-uuid-1',
      'dept-uuid-deleted',
    ]);

    expect(labels.get('dept-uuid-1')).toBe('Engineering');
    expect(labels.has('dept-uuid-deleted')).toBe(false);
  });

  it('returns an empty map when the lookup model does not exist on the client', async () => {
    const prisma = {};
    const executor = new ReportQueryExecutor(prisma as never);

    const labels = await executor.resolveFieldLabels(departmentField, [
      'dept-uuid-1',
    ]);

    expect(labels.size).toBe(0);
  });
});
