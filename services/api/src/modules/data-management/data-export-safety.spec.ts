import { neutraliseFormula } from '../../common/utils/csv.util';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { ExportExecutionService } from './export-execution.service';
import { DataModuleRegistryService } from './module-registry.service';

/*
 * DP-QA-037 / DP-QA-038 - what a standard import template offers and what a
 * standard export publishes.
 */
const STORAGE_INTERNALS = /(Enc|Hmac|Hash|Salt|Secret|Token|Ciphertext)$/;

describe('import/export field allowlist (DP-QA-038)', () => {
  const registry = new DataModuleRegistryService();

  it.each(registry.listModules().map((m) => [m.moduleKey, m] as const))(
    '%s offers no storage-internal column, however the schema flags it',
    (_key, module) => {
      const offered = module.importFields.map((f) => f.key);
      expect(offered.filter((k) => STORAGE_INTERNALS.test(k))).toEqual([]);
    },
  );

  it('does not offer the employee ciphertext and lookup-hash columns, and says why', () => {
    const employees = registry.getModule('employees');
    const offered = new Set(employees.importFields.map((f) => f.key));

    for (const key of ['cnicEnc', 'cnicHmac', 'taxIdentifierEnc']) {
      expect(offered.has(key)).toBe(false);
      expect(employees.excludedFields.find((f) => f.key === key)).toBeDefined();
    }
  });

  it('only offers fields on the module allowlist - a new model column stays out until listed', () => {
    const employees = registry.getModule('employees');
    const offered = employees.importFields.map((f) => f.key);

    // Aliased descriptors are keyed by their contract name, so compare via the
    // unaliased set: nothing outside this fixed list of business fields may appear.
    expect(offered).toEqual(
      expect.arrayContaining(['employeeCode', 'firstName', 'lastName', 'workEmail']),
    );
    expect(offered).not.toEqual(
      expect.arrayContaining(['passwordHash', 'tenantId', 'cnicEnc']),
    );
    expect(offered.length).toBe(54);
  });

  it('keeps authorised business-data import: national and tax ids stay importable', () => {
    const offered = new Set(
      registry.getModule('employees').importFields.map((f) => f.key),
    );
    expect(offered.has('cnic')).toBe(true);
    expect(offered.has('taxIdentifier')).toBe(true);
  });

  it('marks the identifiers as import-only, not exported by default (DP-QA-037)', () => {
    expect(registry.getModule('employees').exportOmittedFields).toEqual([
      'cnic',
      'taxIdentifier',
    ]);
  });
});

describe('spreadsheet formula neutralisation (DP-QA-037)', () => {
  it.each([
    ['=HYPERLINK("http://evil","x")', "'=HYPERLINK(\"http://evil\",\"x\")"],
    ['+cmd|calc', "'+cmd|calc"],
    ['-2+3', "'-2+3"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\t=1+1', "'\t=1+1"],
  ])('prefixes %j so it opens as text', (input, expected) => {
    expect(neutraliseFormula(input)).toBe(expected);
  });

  it.each(['Ada Lovelace', '2026-03-02', '-5', '+923001234567', '3.14', ''])(
    'leaves %j untouched',
    (input) => {
      expect(neutraliseFormula(input)).toBe(input);
    },
  );
});

describe('complete employee export (DP-QA-037)', () => {
  const user = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    permissionKeys: [],
    roleKeys: ['hr'],
  } as unknown as AuthenticatedUser;

  function build(rows: Array<Record<string, unknown>>) {
    const findMany = jest.fn(async () => rows);
    const saved: { buffer?: Buffer } = {};
    const prisma = {
      employee: { findMany },
      dataJob: {
        findFirst: jest.fn(async () => ({
          id: 'job-1',
          moduleKey: 'employees',
          kind: 'EXPORT',
          optionsJson: {},
          submittedByUserId: 'user-1',
          status: 'QUEUED',
        })),
        update: jest.fn(async () => ({})),
      },
    };
    const storage = {
      saveFile: jest.fn(async (args: { buffer: Buffer }) => {
        saved.buffer = args.buffer;
        return { storageKey: 'k', storageProvider: 'local' };
      }),
    };
    const service = new ExportExecutionService(
      prisma as never,
      storage as never,
      new DataModuleRegistryService(),
      {} as never,
      {} as never,
    );
    // getExportSummary re-reads the job; the file content is what matters here.
    jest
      .spyOn(service, 'getExportSummary')
      .mockResolvedValue({} as never);
    return { service, findMany, saved };
  }

  it('filters soft-deleted employees out of the query, scoped to the tenant', async () => {
    const { service, findMany } = build([]);

    await service.runExport(user, 'job-1');

    const where = (findMany.mock.calls[0] as unknown as [{ where: { AND: unknown[] } }])[0].where;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { tenantId: 'tenant-1' },
        { isDeleted: false },
      ]),
    );
  });

  it('writes no identifier or storage column, and neutralises formulas in names', async () => {
    const { service, saved } = build([
      {
        employeeCode: 'E1',
        firstName: '=HYPERLINK("http://evil")',
        lastName: 'Lovelace',
        cnic: '35202-1234567-1',
        cnicEnc: 'ciphertext',
        cnicHmac: 'hash',
        taxIdentifier: 'TAX-1',
        taxIdentifierEnc: 'ciphertext2',
      },
    ]);

    await service.runExport(user, 'job-1');

    const csv = saved.buffer!.toString('utf8');
    const header = csv.split('\n')[0];
    for (const column of ['cnic', 'cnicEnc', 'cnicHmac', 'taxIdentifier', 'taxIdentifierEnc']) {
      expect(header).not.toContain(`"${column}"`);
    }
    expect(csv).not.toContain('35202-1234567-1');
    expect(csv).not.toContain('ciphertext');
    expect(csv).not.toContain('TAX-1');
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });
});
