import { resolveRuntimeField } from '@repo/config';
import { runtimeViewWhere } from './runtime-view-where';

/*
 * BUG-3175. Nine platform-admin runtime modules used to fetch their entire
 * table (with nested includes), then search, filter, sort and slice it in
 * Node via paginateRuntimeRecords. This file turns the same request — search
 * text, view tab, filters, sort, page — into a Prisma `where` / `orderBy` /
 * `skip` / `take`, following PlatformLifecycleService.listCustomers.
 *
 * The in-memory path is kept as the fallback for exactly one situation: a
 * request carries a filter this file cannot express safely in SQL (a computed
 * field, an operator that does not fit the column type, a value Prisma would
 * reject). `buildRuntimeDbQuery` returns null for those, and the caller runs
 * the old path, so a filter never silently stops filtering.
 */

export type RuntimeSortItem = { field: string; direction: 'asc' | 'desc' };
export type RuntimeFilterItem = {
  field: string;
  operator: string;
  value?: unknown;
  values?: unknown[];
};
export type RuntimeOrderBy = Array<Record<string, unknown>>;

export interface RuntimeListSpec {
  /** Registry module key — drives the view rule and the schema manifest. */
  moduleKey: string;
  /**
   * Dot paths to text columns the free-text search looks at. Search used to be
   * a substring scan over JSON.stringify of the whole record, which cannot be
   * reproduced in SQL; these are the columns an operator can see and would
   * type into the box.
   */
  searchPaths: readonly string[];
  /** Dot paths a sort may reference. Anything else is ignored. */
  sortPaths: readonly string[];
  /** Dot paths a filter may be pushed down on. Anything else forces fallback. */
  filterPaths: readonly string[];
  /** The order the list had before; also the tiebreak after a user sort. */
  defaultOrder: RuntimeOrderBy;
}

export interface RuntimeDbQuery {
  where: Record<string, unknown>;
  orderBy: RuntimeOrderBy;
}

export interface RuntimeDbQueryInput {
  search?: string;
  viewKey?: string;
  platformUserId?: string;
  sort: RuntimeSortItem[];
  filters: RuntimeFilterItem[];
}

/** `a.b.c` + leaf -> `{ a: { b: { c: leaf } } }`. */
export function nestPath(path: string, leaf: unknown): Record<string, unknown> {
  return path
    .split('.')
    .reduceRight<unknown>((inner, key) => ({ [key]: inner }), leaf) as Record<
    string,
    unknown
  >;
}

function buildOrderBy(
  spec: RuntimeListSpec,
  sort: RuntimeSortItem[],
): RuntimeOrderBy {
  const allowed = new Set(spec.sortPaths);
  const requested = sort
    .filter((item) => allowed.has(item.field))
    .map((item) => nestPath(item.field, item.direction));
  /*
   * The previous in-memory sort was stable over the default order, so ties
   * kept that order. `id` last makes the page boundary deterministic.
   */
  return [...requested, ...spec.defaultOrder, { id: 'asc' }];
}

function buildSearch(
  spec: RuntimeListSpec,
  search: string | undefined,
): Record<string, unknown> | null {
  const term = search?.trim();
  if (!term || !spec.searchPaths.length) return null;
  return {
    OR: spec.searchPaths.map((path) =>
      nestPath(path, { contains: term, mode: 'insensitive' }),
    ),
  };
}

const text = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? value : null;

function buildFilter(
  spec: RuntimeListSpec,
  filter: RuntimeFilterItem,
): Record<string, unknown> | null {
  if (!spec.filterPaths.includes(filter.field)) return null;
  const field = resolveRuntimeField(spec.moduleKey, filter.field);
  if (!field || field.relationModel) return null;
  const path = filter.field;
  const op = filter.operator;
  const isEnum = (field.enumValues?.length ?? 0) > 0;
  const validEnum = (value: unknown): value is string =>
    typeof value === 'string' && (field.enumValues ?? []).includes(value);

  if (isEnum) {
    if (op === 'eq' && validEnum(filter.value))
      return nestPath(path, { equals: filter.value });
    if (op === 'ne' && validEnum(filter.value))
      return { NOT: nestPath(path, { equals: filter.value }) };
    if (op === 'in' && filter.values?.length && filter.values.every(validEnum))
      return nestPath(path, { in: filter.values });
    return null;
  }
  if (field.type === 'String') {
    const value = text(filter.value);
    if (op === 'eq' && value)
      return nestPath(path, { equals: value, mode: 'insensitive' });
    if (op === 'ne' && value)
      return { NOT: nestPath(path, { equals: value, mode: 'insensitive' }) };
    if (op === 'contains' && value)
      return nestPath(path, { contains: value, mode: 'insensitive' });
    if (op === 'startsWith' && value)
      return nestPath(path, { startsWith: value, mode: 'insensitive' });
    if (op === 'in' && filter.values?.length && filter.values.every(text))
      return nestPath(path, { in: filter.values });
    if (field.nullable && op === 'isNull') return nestPath(path, null);
    if (field.nullable && op === 'isNotNull')
      return nestPath(path, { not: null });
    return null;
  }
  if (field.type === 'Boolean') {
    const value = filter.value;
    const bool =
      value === true || value === 'true'
        ? true
        : value === false || value === 'false'
          ? false
          : null;
    if (bool === null) return null;
    if (op === 'eq') return nestPath(path, bool);
    if (op === 'ne') return nestPath(path, !bool);
    return null;
  }
  if (field.type === 'DateTime') {
    const toDate = (value: unknown) => {
      if (typeof value !== 'string') return null;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };
    const one = toDate(filter.value);
    if (one && ['gt', 'gte', 'lt', 'lte'].includes(op))
      return nestPath(path, { [op]: one });
    if (op === 'between') {
      const [from, to] = (filter.values ?? []).map(toDate);
      if (from && to) return nestPath(path, { gte: from, lte: to });
    }
    if (field.nullable && op === 'isNull') return nestPath(path, null);
    if (field.nullable && op === 'isNotNull')
      return nestPath(path, { not: null });
  }
  return null;
}

/**
 * Prisma query for a runtime list request, or null when a filter cannot be
 * pushed to the database (the caller then uses the in-memory path).
 */
export function buildRuntimeDbQuery(
  spec: RuntimeListSpec,
  input: RuntimeDbQueryInput,
): RuntimeDbQuery | null {
  const parts: Record<string, unknown>[] = [];
  const view = runtimeViewWhere(
    spec.moduleKey,
    input.viewKey,
    input.platformUserId,
  );
  if (Object.keys(view).length) parts.push(view);
  for (const filter of input.filters) {
    const built = buildFilter(spec, filter);
    if (!built) return null;
    parts.push(built);
  }
  const search = buildSearch(spec, input.search);
  if (search) parts.push(search);
  return {
    where: parts.length ? { AND: parts } : {},
    orderBy: buildOrderBy(spec, input.sort),
  };
}

export function runtimePageEnvelope<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
) {
  return {
    items,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasNextPage: page * pageSize < total,
      hasPreviousPage: page > 1,
    },
  };
}

/** What a per-module page method receives; the caller supplies a built query. */
export interface RuntimeDbPageArgs {
  where: Record<string, unknown>;
  orderBy: RuntimeOrderBy;
  skip: number;
  take: number;
}

export function toPageArgs(
  query: RuntimeDbQuery,
  page: number,
  pageSize: number,
): RuntimeDbPageArgs {
  return {
    where: query.where,
    orderBy: query.orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

/*
 * Per-module specs. Search columns are chosen per module and stated here so
 * a reviewer can see what the search box covers:
 *
 *   tenants           name, displayName, legalName, slug, tenantCode,
 *                     customer company name, owner email
 *   subscriptions     tenant name/slug, customer company name, plan name/key,
 *                     Stripe subscription id
 *   plans             key, name, description
 *   invoices          invoice number, bank reference, tenant name/slug,
 *                     customer company name
 *   payments          provider reference, provider payment id, Stripe payment
 *                     intent, tenant name/slug, customer company name,
 *                     invoice number
 *   partner-inquiries reference number, company, contact names, email,
 *                     country, partner display name
 *   partner-onboarding partner display name/legal name/code/number
 *   commissions       commission number, description, partner display
 *                     name/code/number
 *   contract-templates key, name, description
 */
const CREATED_DESC: RuntimeOrderBy = [{ createdAt: 'desc' }];

export const RUNTIME_LIST_SPECS = {
  tenants: {
    moduleKey: 'tenants',
    searchPaths: [
      'name',
      'displayName',
      'legalName',
      'slug',
      'tenantCode',
      'customerAccount.companyName',
      'ownerUser.email',
    ],
    sortPaths: [
      'name',
      'displayName',
      'slug',
      'tenantCode',
      'status',
      'subStatus',
      'environmentType',
      'readinessStatus',
      'createdAt',
      'updatedAt',
      'customerAccount.companyName',
    ],
    filterPaths: [
      'name',
      'slug',
      'tenantCode',
      'status',
      'environmentType',
      'readinessStatus',
      'isDemoData',
      'createdAt',
      'updatedAt',
    ],
    defaultOrder: CREATED_DESC,
  },
  subscriptions: {
    moduleKey: 'subscriptions',
    searchPaths: [
      'tenant.name',
      'tenant.slug',
      'tenant.customerAccount.companyName',
      'plan.name',
      'plan.key',
      'stripeSubscriptionId',
    ],
    sortPaths: [
      'status',
      'billingCycle',
      'currency',
      'startDate',
      'endDate',
      'renewalDate',
      'purchasedSeats',
      'finalPrice',
      'createdAt',
      'updatedAt',
      'tenant.name',
      'plan.name',
    ],
    filterPaths: [
      'status',
      'billingCycle',
      'currency',
      'autoRenew',
      'startDate',
      'endDate',
      'renewalDate',
      'createdAt',
      'updatedAt',
    ],
    defaultOrder: [{ updatedAt: 'desc' }],
  },
  plans: {
    moduleKey: 'plans',
    searchPaths: ['key', 'name', 'description'],
    sortPaths: [
      'key',
      'name',
      'isActive',
      'publicationStatus',
      'salesModel',
      'kind',
      'sortOrder',
      'createdAt',
      'updatedAt',
    ],
    filterPaths: [
      'key',
      'name',
      'isActive',
      'isPublic',
      'publicationStatus',
      'salesModel',
      'kind',
      'createdAt',
      'updatedAt',
    ],
    defaultOrder: [{ sortOrder: 'asc' }, { name: 'asc' }],
  },
  invoices: {
    moduleKey: 'invoices',
    searchPaths: [
      'invoiceNumber',
      'bankReference',
      'tenant.name',
      'tenant.slug',
      'tenant.customerAccount.companyName',
    ],
    sortPaths: [
      'invoiceNumber',
      'status',
      'currency',
      'amount',
      'issueDate',
      'dueDate',
      'paidAt',
      'createdAt',
      'updatedAt',
      'tenant.name',
    ],
    filterPaths: [
      'invoiceNumber',
      'status',
      'currency',
      'issueDate',
      'dueDate',
      'paidAt',
      'createdAt',
      'updatedAt',
    ],
    defaultOrder: CREATED_DESC,
  },
  payments: {
    moduleKey: 'payments',
    searchPaths: [
      'providerReference',
      'providerPaymentId',
      'stripePaymentIntentId',
      'tenant.name',
      'tenant.slug',
      'tenant.customerAccount.companyName',
      'invoice.invoiceNumber',
    ],
    sortPaths: [
      'status',
      'paymentMethod',
      'currency',
      'amount',
      'paidAt',
      'createdAt',
      'updatedAt',
      'tenant.name',
      'invoice.invoiceNumber',
    ],
    filterPaths: [
      'status',
      'paymentMethod',
      'currency',
      'paidAt',
      'createdAt',
      'updatedAt',
    ],
    defaultOrder: CREATED_DESC,
  },
  'partner-inquiries': {
    moduleKey: 'partner-inquiries',
    searchPaths: [
      'referenceNumber',
      'companyName',
      'contactFirstName',
      'contactLastName',
      'email',
      'country',
      'partner.displayName',
    ],
    sortPaths: [
      'referenceNumber',
      'status',
      'type',
      'companyName',
      'contactFirstName',
      'contactLastName',
      'email',
      'country',
      'submittedAt',
      'createdAt',
      'updatedAt',
    ],
    filterPaths: [
      'referenceNumber',
      'status',
      'type',
      'companyName',
      'email',
      'country',
      'assignedToUserId',
      'submittedAt',
      'createdAt',
      'updatedAt',
    ],
    defaultOrder: CREATED_DESC,
  },
  'partner-onboarding': {
    moduleKey: 'partner-onboarding',
    searchPaths: [
      'partner.displayName',
      'partner.legalName',
      'partner.code',
      'partner.partnerNumber',
    ],
    sortPaths: [
      'status',
      'version',
      'submittedAt',
      'reviewedAt',
      'tokenExpiresAt',
      'createdAt',
      'updatedAt',
      'partner.displayName',
    ],
    filterPaths: [
      'status',
      'submittedAt',
      'reviewedAt',
      'tokenExpiresAt',
      'createdAt',
      'updatedAt',
    ],
    defaultOrder: [{ updatedAt: 'desc' }],
  },
  commissions: {
    moduleKey: 'commissions',
    searchPaths: [
      'commissionNumber',
      'description',
      'partner.displayName',
      'partner.code',
      'partner.partnerNumber',
    ],
    sortPaths: [
      'commissionNumber',
      'status',
      'baseAmount',
      'commissionRate',
      'commissionAmount',
      'currencyCode',
      'earnedAt',
      'dueAt',
      'paidAt',
      'createdAt',
      'updatedAt',
      'partner.displayName',
    ],
    filterPaths: [
      'commissionNumber',
      'status',
      'currencyCode',
      'earnedAt',
      'dueAt',
      'paidAt',
      'createdAt',
      'updatedAt',
    ],
    defaultOrder: CREATED_DESC,
  },
  'contract-templates': {
    moduleKey: 'contract-templates',
    searchPaths: ['key', 'name', 'description'],
    sortPaths: [
      'key',
      'name',
      'contractType',
      'isActive',
      'createdAt',
      'updatedAt',
    ],
    filterPaths: [
      'key',
      'name',
      'contractType',
      'isActive',
      'createdAt',
      'updatedAt',
    ],
    defaultOrder: [{ name: 'asc' }],
  },
} satisfies Record<string, RuntimeListSpec>;

export type DbListedModule = keyof typeof RUNTIME_LIST_SPECS;
