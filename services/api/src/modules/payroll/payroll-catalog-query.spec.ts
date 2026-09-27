import { catalogPage, catalogSearch } from './payroll-catalog-query';

/*
 * BUG-3800 — payroll calendars and periods accept the search and paging the
 * generic lookups send, without changing the bare array their list pages read.
 */

describe('catalogSearch', () => {
  it('matches the name, case-insensitively, and ignores blank text', () => {
    expect(catalogSearch(' mon ')).toEqual({
      name: { contains: 'mon', mode: 'insensitive' },
    });
    expect(catalogSearch('   ')).toEqual({});
    expect(catalogSearch(undefined)).toEqual({});
  });
});

describe('catalogPage', () => {
  const rows = ['a', 'b', 'c'];

  it('answers the bare array when no page was asked for', async () => {
    const find = jest.fn().mockResolvedValue(rows);
    const count = jest.fn();
    await expect(catalogPage({}, find, count)).resolves.toBe(rows);
    expect(find).toHaveBeenCalledWith();
    expect(count).not.toHaveBeenCalled();
  });

  it('answers a page and its totals when one was', async () => {
    const find = jest.fn().mockResolvedValue(['c']);
    const count = jest.fn().mockResolvedValue(3);
    await expect(
      catalogPage({ page: 2, pageSize: 2 }, find, count),
    ).resolves.toEqual({
      items: ['c'],
      meta: { page: 2, pageSize: 2, total: 3, totalPages: 2 },
    });
    expect(find).toHaveBeenCalledWith({ skip: 2, take: 2 });
  });

  it('pages from the first page when only a size was asked for (the lookup case)', async () => {
    const find = jest.fn().mockResolvedValue(rows);
    const count = jest.fn().mockResolvedValue(3);
    await catalogPage({ pageSize: 50 }, find, count);
    expect(find).toHaveBeenCalledWith({ skip: 0, take: 50 });
  });
});
