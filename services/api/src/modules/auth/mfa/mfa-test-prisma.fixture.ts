/*
 * A small in-memory stand-in for the Prisma delegates the MFA code touches.
 *
 * Only for specs (a `.fixture.ts`, like `invoice-pdf.fixture.ts`, so jest does
 * not collect it as a suite). It evaluates `where` clauses rather than returning canned
 * rows, because the properties under test — a compare-and-set that refuses a
 * replayed time step, a recovery code that works once, a reset that cannot
 * reach another tenant's account — are all properties of the filter. A mock
 * that returned `{ count: 1 }` whatever it was asked would pass against code
 * that forgot the condition entirely.
 */

type Row = Record<string, unknown>;
type Where = Record<string, unknown> | undefined;

function compare(value: unknown, bound: unknown) {
  if (value === null || value === undefined) return null;
  return (value as number) < (bound as number)
    ? -1
    : (value as number) > (bound as number)
      ? 1
      : 0;
}

export function matchesWhere(row: Row, where: Where): boolean {
  if (!where) return true;

  return Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') {
      return (condition as Where[]).every((part) => matchesWhere(row, part));
    }
    if (key === 'OR') {
      return (condition as Where[]).some((part) => matchesWhere(row, part));
    }
    if (key === 'NOT') {
      return !matchesWhere(row, condition as Where);
    }

    const value = row[key];
    if (
      condition !== null &&
      typeof condition === 'object' &&
      !(condition instanceof Date)
    ) {
      const ops = condition as Record<string, unknown>;
      if ('in' in ops) return (ops.in as unknown[]).includes(value);
      if ('lt' in ops) return compare(value, ops.lt) === -1;
      if ('gt' in ops) return compare(value, ops.gt) === 1;
      if ('not' in ops) return value !== ops.not;
      return false;
    }

    return value === condition;
  });
}

function applyData(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'increment' in value) {
      row[key] =
        ((row[key] as number) ?? 0) +
        (value as { increment: number }).increment;
    } else {
      row[key] = value;
    }
  }
}

function table(rows: Row[]) {
  const find = ({ where }: { where?: Where } = {}) =>
    Promise.resolve(rows.find((row) => matchesWhere(row, where)) ?? null);

  return {
    rows,
    findFirst: find,
    findUnique: find,
    updateMany: ({ where, data }: { where?: Where; data: Row }) => {
      const matched = rows.filter((row) => matchesWhere(row, where));
      matched.forEach((row) => applyData(row, data));
      return Promise.resolve({ count: matched.length });
    },
    update: ({ where, data }: { where?: Where; data: Row }) => {
      const row = rows.find((candidate) => matchesWhere(candidate, where));
      if (!row) return Promise.reject(new Error('Record not found'));
      applyData(row, data);
      return Promise.resolve({ ...row });
    },
    create: ({ data }: { data: Row }) => {
      rows.push({ ...data });
      return Promise.resolve({ ...data });
    },
    createMany: ({ data }: { data: Row[] }) => {
      data.forEach((row) => rows.push({ usedAt: null, ...row }));
      return Promise.resolve({ count: data.length });
    },
    deleteMany: ({ where }: { where?: Where }) => {
      const keep = rows.filter((row) => !matchesWhere(row, where));
      const removed = rows.length - keep.length;
      rows.splice(0, rows.length, ...keep);
      return Promise.resolve({ count: removed });
    },
    count: ({ where }: { where?: Where } = {}) =>
      Promise.resolve(rows.filter((row) => matchesWhere(row, where)).length),
  };
}

export type MfaTestPrisma = ReturnType<typeof createMfaTestPrisma>;

export function createMfaTestPrisma(seed: {
  users?: Row[];
  platformUsers?: Row[];
  refreshTokens?: Row[];
  platformRefreshTokens?: Row[];
}) {
  const prisma = {
    user: table(seed.users ?? []),
    platformUser: table(seed.platformUsers ?? []),
    userMfaRecoveryCode: table([]),
    platformUserMfaRecoveryCode: table([]),
    refreshToken: table(seed.refreshTokens ?? []),
    platformRefreshToken: table(seed.platformRefreshTokens ?? []),
    tenantSetting: { findMany: () => Promise.resolve([] as Row[]) },
    $transaction: (
      callback: (tx: unknown) => Promise<unknown>,
    ): Promise<unknown> => callback(prisma),
  };
  return prisma;
}

export function tenantUserRow(overrides: Row = {}): Row {
  return {
    id: 'user-a',
    tenantId: 'tenant-a',
    email: 'ada@acme.test',
    status: 'ACTIVE',
    passwordHash: '',
    identityId: null,
    identity: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    mfaEnabled: false,
    mfaSecretEncrypted: null,
    mfaPendingSecretEncrypted: null,
    mfaEnabledAt: null,
    mfaLastUsedStep: null,
    tenant: { name: 'Acme', displayName: 'Acme Ltd', status: 'ACTIVE' },
    ...overrides,
  };
}
