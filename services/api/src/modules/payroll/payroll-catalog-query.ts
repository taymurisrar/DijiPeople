import type { PayrollCatalogQueryDto } from './dto/payroll-core.dto';

/* BUG-3800 — a lookup's typed text matches the record's name. */
export function catalogSearch(search?: string) {
  const text = search?.trim();
  return text ? { name: { contains: text, mode: 'insensitive' as const } } : {};
}

/*
 * BUG-3800 — the bare array unless the caller asked for a page. The calendar
 * and period list pages map over the array, and never ask; a lookup asks.
 */
export async function catalogPage<T>(
  query: Pick<PayrollCatalogQueryDto, 'page' | 'pageSize'>,
  find: (page?: { skip: number; take: number }) => Promise<T[]>,
  count: () => Promise<number>,
) {
  if (query.page === undefined && query.pageSize === undefined) return find();
  const pageSize = query.pageSize ?? 20;
  const page = Math.max(query.page ?? 1, 1);
  const [items, total] = await Promise.all([
    find({ skip: (page - 1) * pageSize, take: pageSize }),
    count(),
  ]);
  return {
    items,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}
