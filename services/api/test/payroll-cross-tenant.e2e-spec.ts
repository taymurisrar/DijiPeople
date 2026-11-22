import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PayrollBankExportStatus,
  PayrollExceptionSeverity,
  PayrollJournalEntryStatus,
  PayrollPaymentLineStatus,
  PayrollRunEmployeeStatus,
  PayrollRunStatus,
  PayslipStatus,
} from '@prisma/client';
import * as ExcelJS from 'exceljs';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { ROLE_KEYS } from '../src/common/constants/rbac-matrix';
import { PrismaService } from '../src/common/prisma/prisma.service';
import {
  DbFixtures,
  definedIds,
  describeWithDatabase,
} from './helpers/db-fixtures';
import { HttpActors, type HttpActor } from './helpers/http-actors';

/**
 * Payroll cross-tenant isolation (HTTP, database-backed).
 *
 * Payroll is the most sensitive tenant data the product holds: pay amounts,
 * bank accounts, journals and payslips. ALPHA's tenant admin attacks BETA's
 * payroll resources by id on every verb and surface (calendars, periods, runs,
 * run operations, payment batches, GL accounts, posting rules, journals,
 * employer bank accounts, payslips, /me/payslips).
 *
 * Every attack is paired with:
 *
 *   control  the SAME route as BETA's own admin, on a fresh twin resource,
 *            returns 2xx, so the refusal below is not a wrong URL, a bad body
 *            or a state the action rejects;
 *   attack   ALPHA's admin on a fresh BETA resource in the same state is
 *            exactly 404, the BETA rows are byte-for-byte unchanged when
 *            re-read from the database, and no BETA marker is in the response;
 *   child    ALPHA's OWN parent with a BETA child id is exactly 404 too.
 *
 * EVIDENCE CLASS: database-backed HTTP integration, persisted state verified.
 */
describeWithDatabase()('Payroll cross-tenant (e2e, HTTP)', () => {
  jest.setTimeout(900_000);

  type Method = 'get' | 'post' | 'patch' | 'delete';
  type Res = request.Response;

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  const suffix = randomUUID().slice(0, 6);
  let seq = 0;

  /** Everything one tenant needs to run payroll, plus its standing data. */
  interface Side {
    label: string;
    /** Upper-case marker present in every name BETA owns. */
    marker: string;
    netPay: string;
    tenantId: string;
    admin: HttpActor;
    organizationId: string;
    unitId: string;
    emptyUnitId: string;
    bankId: string;
    employeeId: string;
    employeeName: string;
    otherEmployeeId: string;
    calendarId: string;
    calendarName: string;
    periodId: string;
    emptyPeriodId: string;
    glDebitId: string;
    glDebitCode: string;
    glCreditId: string;
    glCreditCode: string;
    ruleId: string;
    ruleCode: string;
    employeeBankAccountId: string;
    employerAccountId: string;
    employerAccountName: string;
    employerAccountNumber: string;
    main: RunFx;
    otherPayslipId: string;
  }
  let alpha: Side;
  let beta: Side;

  /** The rows hanging off one payroll run, as the factories build them. */
  interface RunFx {
    runId: string;
    runEmployeeId?: string;
    exceptionId?: string;
    adjustmentId?: string;
    exportId?: string;
    lineId?: string;
    payslipId?: string;
    journalId?: string;
  }

  interface RunOpts {
    status?: PayrollRunStatus;
    /** Use the period of the calendar bound to an empty business unit. */
    empty?: boolean;
    employee?: boolean;
    forOtherEmployee?: boolean;
    exception?: PayrollExceptionSeverity;
    adjustment?: boolean;
    batch?: {
      exportStatus: PayrollBankExportStatus;
      lineStatus: PayrollPaymentLineStatus;
    };
    payslip?: PayslipStatus;
    journal?: PayrollJournalEntryStatus;
    runEmployeeStatus?: PayrollRunEmployeeStatus;
  }

  // ---------------------------------------------------------------- helpers

  const call = (method: Method, as: HttpActor, path: string, body?: object) => {
    const req = request(app.getHttpServer())
      [method](`/${path}`)
      .set('Authorization', `Bearer ${as.token}`)
      .set('X-DijiPeople-App', 'web')
      .buffer(true);
    return body === undefined ? req : req.send(body);
  };

  const callBinary = (method: Method, as: HttpActor, path: string) =>
    request(app.getHttpServer())
      [method](`/${path}`)
      .set('Authorization', `Bearer ${as.token}`)
      .set('X-DijiPeople-App', 'web')
      .buffer(true)
      .responseType('blob');

  const textOf = (res: Res): string =>
    Buffer.isBuffer(res.body)
      ? res.body.toString('latin1')
      : `${res.text ?? ''}${JSON.stringify(res.body)}`;

  const xlsxText = async (res: Res): Promise<string> => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      res.body as Parameters<typeof workbook.xlsx.load>[0],
    );
    const out: string[] = [];
    workbook.eachSheet((sheet) =>
      sheet.eachRow((row) => row.eachCell((cell) => out.push(cell.text))),
    );
    return out.join('\n');
  };

  const brief = (res: Res): string => textOf(res).slice(0, 300);

  /** Status assertion whose failure message carries the response body. */
  const expectStatus = (res: Res, status: number) => {
    expect({
      status: res.status,
      detail: res.status === status ? '' : brief(res),
    }).toEqual({ status, detail: '' });
  };

  const expectOk = (res: Res) => {
    expect({
      ok: res.status === 200 || res.status === 201,
      status: res.status,
      detail: res.status === 200 || res.status === 201 ? '' : brief(res),
    }).toEqual({ ok: true, status: res.status, detail: '' });
  };

  /** Strings that only BETA's data can contain. */
  const betaMarkers = (): string[] => [
    beta.marker,
    beta.netPay,
    beta.tenantId,
    beta.main.runId,
    beta.employerAccountNumber,
  ];

  const expectNoBeta = (text: string) => {
    for (const marker of betaMarkers()) {
      expect(text).not.toContain(marker);
    }
  };

  const listItems = (res: Res): Array<{ id: string }> => {
    const body = res.body as unknown;
    const items = Array.isArray(body)
      ? body
      : ((body as { items?: unknown[] }).items ?? []);
    return items as Array<{ id: string }>;
  };

  const snap = (value: unknown): unknown =>
    JSON.parse(JSON.stringify(value)) as unknown;

  // --------------------------------------------------------------- fixtures

  const now = new Date();
  const periodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
  const periodEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0),
  );

  async function newRun(s: Side, o: RunOpts = {}): Promise<RunFx> {
    const periodId = o.empty ? s.emptyPeriodId : s.periodId;
    const max = await prisma.payrollRun.aggregate({
      where: { payrollPeriodId: periodId },
      _max: { runNumber: true },
    });
    const status = o.status ?? PayrollRunStatus.DRAFT;
    const run = await prisma.payrollRun.create({
      data: {
        tenantId: s.tenantId,
        payrollPeriodId: periodId,
        runNumber: (max._max.runNumber ?? 0) + 1,
        status,
        notes: `Notes ${s.marker}`,
      },
      select: { id: true },
    });
    const fx: RunFx = { runId: run.id };
    const wantsEmployee =
      o.employee ||
      o.forOtherEmployee ||
      o.batch ||
      o.payslip ||
      o.journal ||
      o.exception;
    if (!wantsEmployee) return fx;

    const employeeId = o.forOtherEmployee ? s.otherEmployeeId : s.employeeId;
    const derived: Record<PayrollRunStatus, PayrollRunEmployeeStatus> = {
      DRAFT: PayrollRunEmployeeStatus.PENDING,
      CALCULATING: PayrollRunEmployeeStatus.PENDING,
      CALCULATED: PayrollRunEmployeeStatus.CALCULATED,
      REVIEWED: PayrollRunEmployeeStatus.REVIEWED,
      APPROVED: PayrollRunEmployeeStatus.APPROVED,
      PAID: PayrollRunEmployeeStatus.PAID,
      LOCKED: PayrollRunEmployeeStatus.LOCKED,
      FAILED: PayrollRunEmployeeStatus.PENDING,
    };
    const runEmployee = await prisma.payrollRunEmployee.create({
      data: {
        tenantId: s.tenantId,
        payrollRunId: run.id,
        employeeId,
        status: o.runEmployeeStatus ?? derived[status],
        currencyCode: 'USD',
        grossEarnings: s.netPay,
        netPay: s.netPay,
      },
      select: { id: true },
    });
    fx.runEmployeeId = runEmployee.id;
    const line = await prisma.payrollRunLineItem.create({
      data: {
        tenantId: s.tenantId,
        payrollRunEmployeeId: runEmployee.id,
        category: 'EARNING',
        label: `Basic ${s.marker}`,
        amount: s.netPay,
        currencyCode: 'USD',
      },
      select: { id: true },
    });

    if (o.exception) {
      const exception = await prisma.payrollException.create({
        data: {
          tenantId: s.tenantId,
          payrollRunId: run.id,
          employeeId,
          severity: o.exception,
          errorType: 'GENERAL_ISSUE',
          message: `Issue ${s.marker}`,
        },
        select: { id: true },
      });
      fx.exceptionId = exception.id;
    }
    if (o.adjustment) {
      const adjustment = await prisma.payrollAdjustment.create({
        data: {
          tenantId: s.tenantId,
          payrollRunId: run.id,
          employeeId,
          label: `Adjustment ${s.marker}`,
          amount: '50.00',
          currencyCode: 'USD',
        },
        select: { id: true },
      });
      fx.adjustmentId = adjustment.id;
    }
    if (o.batch) {
      seq += 1;
      const batch = await prisma.payrollBankExport.create({
        data: {
          tenantId: s.tenantId,
          payrollRunId: run.id,
          format: 'CSV',
          providerKey: 'csv',
          status: o.batch.exportStatus,
          fileName: `bank-${s.marker}-${seq}.csv`,
          recordCount: 1,
          totalAmount: s.netPay,
          currencyCode: 'USD',
          checksum: 'checksum',
          generatedBy: s.admin.id,
          metadata: { employerBankAccountName: s.employerAccountName },
        },
        select: { id: true },
      });
      const paymentLine = await prisma.payrollPaymentLine.create({
        data: {
          tenantId: s.tenantId,
          payrollBankExportId: batch.id,
          payrollRunId: run.id,
          payrollRunEmployeeId: runEmployee.id,
          employeeId,
          employeeBankAccountId: s.employeeBankAccountId,
          currencyCode: 'USD',
          amount: s.netPay,
          status: o.batch.lineStatus,
        },
        select: { id: true },
      });
      fx.exportId = batch.id;
      fx.lineId = paymentLine.id;
    }
    if (o.payslip) {
      seq += 1;
      const payslip = await prisma.payslip.create({
        data: {
          tenantId: s.tenantId,
          payrollRunId: run.id,
          payrollRunEmployeeId: runEmployee.id,
          employeeId,
          payslipNumber: `PSL-${s.marker}-${seq}`,
          status: o.payslip,
          currencyCode: 'USD',
          grossEarnings: s.netPay,
          netPay: s.netPay,
          generatedAt: new Date(),
          publishedAt: o.payslip === 'PUBLISHED' ? new Date() : null,
        },
        select: { id: true },
      });
      await prisma.payslipLineItem.create({
        data: {
          tenantId: s.tenantId,
          payslipId: payslip.id,
          payrollRunLineItemId: line.id,
          category: 'EARNING',
          label: `Basic ${s.marker}`,
          amount: s.netPay,
          currencyCode: 'USD',
        },
      });
      fx.payslipId = payslip.id;
    }
    if (o.journal) {
      seq += 1;
      const journal = await prisma.payrollJournalEntry.create({
        data: {
          tenantId: s.tenantId,
          payrollRunId: run.id,
          journalType: 'ORIGINAL',
          status: o.journal,
          journalNumber: `JN-${s.marker}-${seq}`,
          generatedAt: new Date(),
        },
        select: { id: true },
      });
      await prisma.payrollJournalEntryLine.createMany({
        data: [
          {
            tenantId: s.tenantId,
            journalEntryId: journal.id,
            accountId: s.glDebitId,
            debitAmount: s.netPay,
            description: `Line ${s.marker}`,
            employeeId,
          },
          {
            tenantId: s.tenantId,
            journalEntryId: journal.id,
            accountId: s.glCreditId,
            creditAmount: s.netPay,
            description: `Line ${s.marker}`,
            employeeId,
          },
        ],
      });
      fx.journalId = journal.id;
    }
    return fx;
  }

  const runState = async (runId: string): Promise<unknown> =>
    snap({
      run: await prisma.payrollRun.findUnique({ where: { id: runId } }),
      employees: await prisma.payrollRunEmployee.findMany({
        where: { payrollRunId: runId },
        orderBy: { id: 'asc' },
      }),
      lineItems: await prisma.payrollRunLineItem.findMany({
        where: { payrollRunEmployee: { payrollRunId: runId } },
        orderBy: { id: 'asc' },
      }),
      exceptions: await prisma.payrollException.findMany({
        where: { payrollRunId: runId },
        orderBy: { id: 'asc' },
      }),
      adjustments: await prisma.payrollAdjustment.findMany({
        where: { payrollRunId: runId },
        orderBy: { id: 'asc' },
      }),
      payslips: await prisma.payslip.findMany({
        where: { payrollRunId: runId },
        orderBy: { id: 'asc' },
      }),
      payslipEvents: await prisma.payslipEventLog.count({
        where: { payslip: { payrollRunId: runId } },
      }),
      bankExports: await prisma.payrollBankExport.findMany({
        where: { payrollRunId: runId },
        orderBy: { id: 'asc' },
      }),
      paymentLines: await prisma.payrollPaymentLine.findMany({
        where: { payrollRunId: runId },
        orderBy: { id: 'asc' },
      }),
      journals: await prisma.payrollJournalEntry.findMany({
        where: { payrollRunId: runId },
        include: { lines: { orderBy: { id: 'asc' } } },
        orderBy: { id: 'asc' },
      }),
    });

  async function side(label: string): Promise<Side> {
    const marker = `${label.toUpperCase()}MK${suffix.toUpperCase()}`;
    const netPay = label === 'beta' ? '7654.32' : '1111.11';
    const tenant = await fixtures.createTenant(`pay${label}`);
    const organizationId = await fixtures.createOrganization(tenant.id);
    const unitId = await fixtures.createBusinessUnit(tenant.id, organizationId);
    const emptyUnitId = await fixtures.createBusinessUnit(
      tenant.id,
      organizationId,
      'empty-bu',
    );
    const admin = await actors.tenantUser(tenant.id, unitId, `pay${label}`);
    const role = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        key: ROLE_KEYS.GLOBAL_ADMIN,
        name: `Admin ${label}`,
      },
      select: { id: true },
    });
    await prisma.userRole.create({
      data: { tenantId: tenant.id, userId: admin.id, roleId: role.id },
    });
    await prisma.currency.create({
      data: { tenantId: tenant.id, name: 'US Dollar', code: 'USD' },
    });
    const bank = await prisma.bank.create({
      data: {
        tenantId: tenant.id,
        code: `BK${marker}`,
        name: `Bank ${marker}`,
        countryCode: 'US',
      },
      select: { id: true },
    });
    // The admin user is the employee behind /me/payslips.
    const employee = await prisma.employee.create({
      data: {
        tenantId: tenant.id,
        employeeCode: `PAY-${marker}`,
        firstName: 'Pay',
        lastName: marker,
        email: `${label}-emp-${suffix}@example.invalid`,
        phone: '000',
        hireDate: new Date('2024-01-01'),
        userId: admin.id,
      },
      select: { id: true },
    });
    const other = await prisma.employee.create({
      data: {
        tenantId: tenant.id,
        employeeCode: `OTH-${marker}`,
        firstName: 'Other',
        lastName: marker,
        phone: '000',
        hireDate: new Date('2024-01-01'),
      },
      select: { id: true },
    });
    const calendarName = `Calendar ${marker}`;
    const calendar = await prisma.payrollCalendar.create({
      data: {
        tenantId: tenant.id,
        name: calendarName,
        frequency: 'MONTHLY',
        currencyCode: 'USD',
      },
      select: { id: true },
    });
    const period = await prisma.payrollPeriod.create({
      data: {
        tenantId: tenant.id,
        payrollCalendarId: calendar.id,
        name: `Period ${marker}`,
        periodStart,
        periodEnd,
      },
      select: { id: true },
    });
    const emptyCalendar = await prisma.payrollCalendar.create({
      data: {
        tenantId: tenant.id,
        businessUnitId: emptyUnitId,
        name: `Empty calendar ${marker}`,
        frequency: 'MONTHLY',
        currencyCode: 'USD',
      },
      select: { id: true },
    });
    const emptyPeriod = await prisma.payrollPeriod.create({
      data: {
        tenantId: tenant.id,
        payrollCalendarId: emptyCalendar.id,
        name: `Empty period ${marker}`,
        periodStart,
        periodEnd,
      },
      select: { id: true },
    });
    const glDebitCode = `GLD-${marker}`;
    const glCreditCode = `GLC-${marker}`;
    const glDebit = await prisma.payrollGlAccount.create({
      data: {
        tenantId: tenant.id,
        code: glDebitCode,
        name: `Debit ${marker}`,
        accountType: 'EXPENSE',
      },
      select: { id: true },
    });
    const glCredit = await prisma.payrollGlAccount.create({
      data: {
        tenantId: tenant.id,
        code: glCreditCode,
        name: `Credit ${marker}`,
        accountType: 'LIABILITY',
      },
      select: { id: true },
    });
    const ruleCode = `RULE-${marker}`;
    const rule = await prisma.payrollPostingRule.create({
      data: {
        tenantId: tenant.id,
        code: ruleCode,
        name: `Rule ${marker}`,
        sourceCategory: 'EARNING',
        debitAccountId: glDebit.id,
        creditAccountId: glCredit.id,
        effectiveFrom: new Date('2020-01-01'),
      },
      select: { id: true },
    });
    const employeeBank = await prisma.employeeBankAccount.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.id,
        bankId: bank.id,
        accountTitle: `Holder ${marker}`,
        accountNumber: `EMPACCT${marker}`,
        countryCode: 'US',
        currencyCode: 'USD',
        isPrimaryPayroll: true,
        effectiveFrom: new Date('2024-01-01'),
        verificationStatus: 'VERIFIED',
      },
      select: { id: true },
    });
    const employerAccountName = `Employer ${marker}`;
    const employerAccountNumber = `ERACCT${marker}`;
    const employer = await prisma.employerBankAccount.create({
      data: {
        tenantId: tenant.id,
        accountName: employerAccountName,
        accountTitle: `Employer holder ${marker}`,
        accountNumber: employerAccountNumber,
        bankId: bank.id,
        currencyCode: 'USD',
        isDefaultPayrollAccount: true,
      },
      select: { id: true },
    });

    const built: Side = {
      label,
      marker,
      netPay,
      tenantId: tenant.id,
      admin,
      organizationId,
      unitId,
      emptyUnitId,
      bankId: bank.id,
      employeeId: employee.id,
      employeeName: `Pay ${marker}`,
      otherEmployeeId: other.id,
      calendarId: calendar.id,
      calendarName,
      periodId: period.id,
      emptyPeriodId: emptyPeriod.id,
      glDebitId: glDebit.id,
      glDebitCode,
      glCreditId: glCredit.id,
      glCreditCode,
      ruleId: rule.id,
      ruleCode,
      employeeBankAccountId: employeeBank.id,
      employerAccountId: employer.id,
      employerAccountName,
      employerAccountNumber,
      main: { runId: '' },
      otherPayslipId: '',
    };
    // One standing run carrying every kind of child row.
    built.main = await newRun(built, {
      status: PayrollRunStatus.APPROVED,
      exception: PayrollExceptionSeverity.WARNING,
      adjustment: true,
      batch: {
        exportStatus: PayrollBankExportStatus.GENERATED,
        lineStatus: PayrollPaymentLineStatus.GENERATED,
      },
      payslip: PayslipStatus.PUBLISHED,
      journal: PayrollJournalEntryStatus.GENERATED,
    });
    // A published payslip of ANOTHER employee in the same tenant.
    const otherRun = await newRun(built, {
      status: PayrollRunStatus.APPROVED,
      forOtherEmployee: true,
      payslip: PayslipStatus.PUBLISHED,
    });
    built.otherPayslipId = otherRun.payslipId ?? '';
    return built;
  }

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    fixtures = new DbFixtures(prisma, 'payroll');
    actors = new HttpActors(app, suffix);
    alpha = await side('alpha');
    beta = await side('beta');
  });

  afterAll(async () => {
    // try/finally so a cleanup failure can never leave the Nest app open and the
    // jest process hanging (CI has no --forceExit).
    try {
      const tenantIds = definedIds([alpha?.tenantId, beta?.tenantId]);
      if (prisma && tenantIds.length > 0) {
        const where = { tenantId: { in: tenantIds } };
        // Restrict foreign keys between payroll tables: leaves first.
        await prisma.payrollJournalEntryLine.deleteMany({ where });
        await prisma.payrollJournalEntry.deleteMany({ where });
        await prisma.payrollPostingRule.deleteMany({ where });
        await prisma.payslip.deleteMany({ where });
        await prisma.payrollPaymentLine.deleteMany({ where });
        await prisma.payrollBankExport.deleteMany({ where });
        await prisma.payrollRun.deleteMany({ where });
        await prisma.payrollGlAccount.deleteMany({ where });
        await prisma.employeeBankAccount.deleteMany({ where });
        await prisma.employee.deleteMany({ where });
      }
      await actors?.cleanup();
      await fixtures?.cleanup();
    } finally {
      await app?.close();
    }
  });

  // ------------------------------------------------------------ case engine

  interface Case<F> {
    name: string;
    method: Method;
    make: (s: Side) => Promise<F>;
    path: (f: F) => string;
    body?: (f: F, owner: Side) => object;
    snapshot: (f: F) => Promise<unknown>;
    /** Strings the OWNER's successful response must contain (not vacuous). */
    contains?: (owner: Side, f: F) => string[];
    format?: 'json' | 'xlsx' | 'binary';
    /** ALPHA's own parent with BETA's child id. */
    mixed?: (own: F, victim: F) => string;
    /**
     * Status the child-id attack legitimately returns when it is not 404: a
     * scoped updateMany that matches nothing reports a conflict.
     */
    mixedStatus?: number;
    /** Owner control that cannot reach success; see the journal reversal case. */
    control?: { make: (s: Side) => Promise<F>; status: number };
  }

  const send = <F>(
    c: Case<F>,
    as: HttpActor,
    f: F,
    owner: Side,
    path?: string,
  ) => {
    const target = path ?? c.path(f);
    if (c.format === 'xlsx' || c.format === 'binary') {
      return callBinary(c.method, as, target);
    }
    return call(c.method, as, target, c.body?.(f, owner));
  };

  function defineCases<F>(cases: Array<Case<F>>) {
    describe.each(cases)('$method $name', (c) => {
      it('control: the owner (BETA admin) succeeds on its own resource', async () => {
        const f = await (c.control?.make ?? c.make)(beta);
        const res = await send(c, beta.admin, f, beta);
        if (c.control) {
          expectStatus(res, c.control.status);
          return;
        }
        expectOk(res);
        const text = c.format === 'xlsx' ? await xlsxText(res) : textOf(res);
        for (const needle of c.contains?.(beta, f) ?? []) {
          expect(text).toContain(needle);
        }
      });

      it('attack: ALPHA admin on a BETA resource is exactly 404, BETA unchanged, nothing leaked', async () => {
        const victim = await c.make(beta);
        const before = await c.snapshot(victim);
        const res = await send(c, alpha.admin, victim, beta);
        expectStatus(res, 404);
        expect(await c.snapshot(victim)).toEqual(before);
        expectNoBeta(textOf(res));
      });

      if (c.mixed) {
        it("child id: ALPHA's own parent with a BETA child id is exactly 404", async () => {
          const own = await c.make(alpha);
          const victim = await c.make(beta);
          const ownBefore = await c.snapshot(own);
          const before = await c.snapshot(victim);
          const res = await send(
            c,
            alpha.admin,
            own,
            alpha,
            c.mixed?.(own, victim),
          );
          expectStatus(res, c.mixedStatus ?? 404);
          expect(await c.snapshot(victim)).toEqual(before);
          expect(await c.snapshot(own)).toEqual(ownBefore);
          expectNoBeta(textOf(res));
        });
      }
    });
  }

  const runCase = (
    name: string,
    method: Method,
    path: (f: RunFx) => string,
    opts: RunOpts,
    extra: Partial<Case<RunFx>> = {},
  ): Case<RunFx> => ({
    name,
    method,
    make: (s) => newRun(s, opts),
    path,
    snapshot: (f) => runState(f.runId),
    ...extra,
  });

  const earnings = { status: PayrollRunStatus.APPROVED, employee: true };
  const generated = {
    exportStatus: PayrollBankExportStatus.GENERATED,
    lineStatus: PayrollPaymentLineStatus.GENERATED,
  };
  const failed = {
    exportStatus: PayrollBankExportStatus.FAILED,
    lineStatus: PayrollPaymentLineStatus.FAILED,
  };

  // ------------------------------------------------------- 1. run: reads

  describe('payroll runs (read)', () => {
    defineCases<RunFx>([
      runCase(
        'payroll/runs/:id',
        'get',
        (f) => `payroll/runs/${f.runId}`,
        { ...earnings },
        { contains: (o, f) => [f.runId, o.marker, o.netPay] },
      ),
      runCase(
        'payroll/runs/:id/employees',
        'get',
        (f) => `payroll/runs/${f.runId}/employees`,
        { ...earnings },
        { contains: (o) => [o.marker, o.netPay] },
      ),
      runCase(
        'payroll/runs/:id/exceptions',
        'get',
        (f) => `payroll/runs/${f.runId}/exceptions`,
        { exception: PayrollExceptionSeverity.WARNING },
        { contains: (o) => [`Issue ${o.marker}`] },
      ),
      runCase(
        'payroll/runs/:id/adjustments',
        'get',
        (f) => `payroll/runs/${f.runId}/adjustments`,
        { adjustment: true, employee: true },
        { contains: (o) => [`Adjustment ${o.marker}`] },
      ),
      runCase(
        'payroll/runs/:id/cost-allocations',
        'get',
        (f) => `payroll/runs/${f.runId}/cost-allocations`,
        { ...earnings },
        { contains: () => ['items'] },
      ),
      runCase(
        'payroll/operations/runs/:id/preview',
        'get',
        (f) => `payroll/operations/runs/${f.runId}/preview`,
        { ...earnings },
        { contains: (o) => [o.marker, o.netPay] },
      ),
      runCase(
        'payroll/operations/runs/:id/lifecycle',
        'get',
        (f) => `payroll/operations/runs/${f.runId}/lifecycle`,
        { exception: PayrollExceptionSeverity.WARNING },
        { contains: (o) => [`Issue ${o.marker}`] },
      ),
      runCase(
        'payroll/operations/runs/:id/payment-batches',
        'get',
        (f) => `payroll/operations/runs/${f.runId}/payment-batches`,
        { ...earnings, batch: generated },
        { contains: (o) => [o.marker] },
      ),
      runCase(
        'payroll/operations/runs/:id/payment-batches/:exportId/result-template',
        'get',
        (f) =>
          `payroll/operations/runs/${f.runId}/payment-batches/${f.exportId}/result-template`,
        { ...earnings, batch: generated },
        {
          format: 'xlsx',
          contains: (o) => [o.marker],
          mixed: (own, victim) =>
            `payroll/operations/runs/${own.runId}/payment-batches/${victim.exportId}/result-template`,
        },
      ),
    ]);
  });

  // ------------------------------------------------------ 2. run: mutations

  describe('payroll runs (mutations and operations)', () => {
    const rows = (f: RunFx) => ({
      rows: [
        {
          paymentLineId: f.lineId,
          status: 'FAILED',
          failureReason: 'bank rejected',
        },
      ],
    });
    defineCases<RunFx>([
      runCase('payroll/runs/:id', 'delete', (f) => `payroll/runs/${f.runId}`, {
        employee: true,
      }),
      runCase(
        'payroll/runs/:id/calculate',
        'post',
        (f) => `payroll/runs/${f.runId}/calculate`,
        { empty: true },
      ),
      runCase(
        'payroll/runs/:id/lock',
        'post',
        (f) => `payroll/runs/${f.runId}/lock`,
        { status: PayrollRunStatus.CALCULATED, employee: true },
      ),
      runCase(
        'payroll/runs/:id/calculate-taxes',
        'post',
        (f) => `payroll/runs/${f.runId}/calculate-taxes`,
        { status: PayrollRunStatus.CALCULATED, employee: true },
      ),
      runCase(
        'payroll/runs/:id/exceptions/:exceptionId/acknowledge',
        'post',
        (f) =>
          `payroll/runs/${f.runId}/exceptions/${f.exceptionId}/acknowledge`,
        { exception: PayrollExceptionSeverity.WARNING },
        {
          body: () => ({ comment: 'ack' }),
          mixed: (own, victim) =>
            `payroll/runs/${own.runId}/exceptions/${victim.exceptionId}/acknowledge`,
        },
      ),
      runCase(
        'payroll/runs/:id/exceptions/:exceptionId/resolve',
        'post',
        (f) => `payroll/runs/${f.runId}/exceptions/${f.exceptionId}/resolve`,
        { exception: PayrollExceptionSeverity.WARNING },
        {
          body: () => ({ comment: 'done' }),
          mixed: (own, victim) =>
            `payroll/runs/${own.runId}/exceptions/${victim.exceptionId}/resolve`,
        },
      ),
      runCase(
        'payroll/runs/:id/adjustments',
        'post',
        (f) => `payroll/runs/${f.runId}/adjustments`,
        { employee: true },
        {
          body: (f, owner) => ({
            employeeId: owner.employeeId,
            label: 'New adjustment',
            amount: 10,
            currencyCode: 'USD',
          }),
        },
      ),
      runCase(
        'payroll/runs/:id/adjustments/:adjustmentId',
        'patch',
        (f) => `payroll/runs/${f.runId}/adjustments/${f.adjustmentId}`,
        { employee: true, adjustment: true },
        {
          body: () => ({ label: 'HIJACKED' }),
          mixed: (own, victim) =>
            `payroll/runs/${own.runId}/adjustments/${victim.adjustmentId}`,
        },
      ),
      runCase(
        'payroll/runs/:id/adjustments/:adjustmentId',
        'delete',
        (f) => `payroll/runs/${f.runId}/adjustments/${f.adjustmentId}`,
        { employee: true, adjustment: true },
        {
          mixed: (own, victim) =>
            `payroll/runs/${own.runId}/adjustments/${victim.adjustmentId}`,
        },
      ),
      ...(['submit', 'approve', 'reject'] as const).map((action) =>
        runCase(
          `payroll/runs/:id/adjustments/:adjustmentId/${action}`,
          'post',
          (f) =>
            `payroll/runs/${f.runId}/adjustments/${f.adjustmentId}/${action}`,
          { employee: true, adjustment: true },
          {
            body: () => ({}),
            mixed: (own, victim) =>
              `payroll/runs/${own.runId}/adjustments/${victim.adjustmentId}/${action}`,
          },
        ),
      ),
      runCase(
        'payroll/operations/runs/:id/finalize',
        'post',
        (f) => `payroll/operations/runs/${f.runId}/finalize`,
        { status: PayrollRunStatus.CALCULATED, employee: true },
      ),
      runCase(
        'payroll/operations/runs/:id/review',
        'post',
        (f) => `payroll/operations/runs/${f.runId}/review`,
        { status: PayrollRunStatus.CALCULATED, employee: true },
      ),
      runCase(
        'payroll/operations/runs/:id/return-to-calculation',
        'post',
        (f) => `payroll/operations/runs/${f.runId}/return-to-calculation`,
        { status: PayrollRunStatus.REVIEWED, employee: true },
      ),
      runCase(
        'payroll/operations/runs/:id/bank-export?format=CSV',
        'post',
        (f) => `payroll/operations/runs/${f.runId}/bank-export?format=CSV`,
        { ...earnings },
        { contains: (o) => [`EMPACCT${o.marker}`] },
      ),
      runCase(
        'payroll/operations/runs/:id/payment-batches/:exportId/submit',
        'post',
        (f) =>
          `payroll/operations/runs/${f.runId}/payment-batches/${f.exportId}/submit`,
        { ...earnings, batch: generated },
        {
          // submit is a scoped updateMany: no row matched reports a conflict.
          mixedStatus: 409,
          mixed: (own, victim) =>
            `payroll/operations/runs/${own.runId}/payment-batches/${victim.exportId}/submit`,
        },
      ),
      runCase(
        'payroll/operations/runs/:id/payment-batches/:exportId/cancel',
        'post',
        (f) =>
          `payroll/operations/runs/${f.runId}/payment-batches/${f.exportId}/cancel`,
        { ...earnings, batch: generated },
        {
          mixed: (own, victim) =>
            `payroll/operations/runs/${own.runId}/payment-batches/${victim.exportId}/cancel`,
        },
      ),
      runCase(
        'payroll/operations/runs/:id/payment-batches/:exportId/import-results',
        'post',
        (f) =>
          `payroll/operations/runs/${f.runId}/payment-batches/${f.exportId}/import-results`,
        { ...earnings, batch: generated },
        {
          body: rows,
          mixed: (own, victim) =>
            `payroll/operations/runs/${own.runId}/payment-batches/${victim.exportId}/import-results`,
        },
      ),
      runCase(
        'payroll/operations/runs/:id/payment-batches/:exportId/import-results/preview',
        'post',
        (f) =>
          `payroll/operations/runs/${f.runId}/payment-batches/${f.exportId}/import-results/preview`,
        { ...earnings, batch: generated },
        {
          body: rows,
          contains: (o) => [o.marker],
          mixed: (own, victim) =>
            `payroll/operations/runs/${own.runId}/payment-batches/${victim.exportId}/import-results/preview`,
        },
      ),
      runCase(
        'payroll/operations/runs/:id/payment-batches/:exportId/retry-failed',
        'post',
        (f) =>
          `payroll/operations/runs/${f.runId}/payment-batches/${f.exportId}/retry-failed`,
        { ...earnings, batch: failed },
        {
          body: (f) => ({ paymentLineIds: [f.lineId], reason: 'retry' }),
          mixed: (own, victim) =>
            `payroll/operations/runs/${own.runId}/payment-batches/${victim.exportId}/retry-failed`,
        },
      ),
      runCase(
        'payroll/operations/runs/:id/payment-lines/:lineId/reconcile',
        'post',
        (f) =>
          `payroll/operations/runs/${f.runId}/payment-lines/${f.lineId}/reconcile`,
        { ...earnings, batch: generated },
        {
          body: () => ({ status: 'DISBURSED', transactionReference: 'TX-1' }),
          mixed: (own, victim) =>
            `payroll/operations/runs/${own.runId}/payment-lines/${victim.lineId}/reconcile`,
        },
      ),
      runCase(
        'payroll/operations/runs/:id/disburse',
        'post',
        (f) => `payroll/operations/runs/${f.runId}/disburse`,
        {
          ...earnings,
          batch: {
            exportStatus: PayrollBankExportStatus.DISBURSED,
            lineStatus: PayrollPaymentLineStatus.DISBURSED,
          },
        },
      ),
    ]);
  });

  // -------------------------------------------------------- 3. journals

  describe('payroll journals', () => {
    const journalRun = (
      name: string,
      method: Method,
      suffixPath: string,
      status: PayrollJournalEntryStatus,
      extra: Partial<Case<RunFx>> = {},
    ) =>
      runCase(
        name,
        method,
        (f) => `payroll/runs/${f.runId}/${suffixPath}`,
        { ...earnings, journal: status },
        extra,
      );
    const GENERATED = PayrollJournalEntryStatus.GENERATED;
    defineCases<RunFx>([
      runCase(
        'payroll/runs/:runId/journal/generate',
        'post',
        (f) => `payroll/runs/${f.runId}/journal/generate`,
        { status: PayrollRunStatus.CALCULATED, employee: true },
      ),
      journalRun('payroll/runs/:runId/journal', 'get', 'journal', GENERATED, {
        contains: (o) => [`JN-${o.marker}`, o.glDebitCode],
      }),
      journalRun('payroll/runs/:runId/journals', 'get', 'journals', GENERATED, {
        contains: (o) => [`JN-${o.marker}`],
      }),
      journalRun(
        'payroll/runs/:runId/journal/export',
        'get',
        'journal/export',
        GENERATED,
        { contains: (o) => [`JN-${o.marker}`, o.glDebitCode, o.glCreditCode] },
      ),
      journalRun(
        'payroll/runs/:runId/journal/mark-exported',
        'post',
        'journal/mark-exported',
        GENERATED,
      ),
      journalRun(
        'payroll/runs/:runId/journal/validate',
        'post',
        'journal/validate',
        GENERATED,
      ),
      journalRun(
        'payroll/runs/:runId/journal/mark-posted',
        'post',
        'journal/mark-posted',
        PayrollJournalEntryStatus.EXPORTED,
      ),
      journalRun(
        'payroll/runs/:runId/journal/reverse',
        'post',
        'journal/reverse',
        PayrollJournalEntryStatus.POSTED,
        {
          body: () => ({ reason: 'posted in error' }),
          // The default owner control now expects a 2xx: BETA's admin reverses
          // a POSTED BETA journal (BUG-4639 fixed by migration
          // 20261122100000, which drops the two obsolete run-pair unique indexes).
        },
      ),
    ]);
  });

  // ------------------------------------------- 3b. reversal (BUG-4639)

  describe('journal reversal after the run-pair unique indexes were dropped (BUG-4639)', () => {
    const lineTotals = async (journalId: string) => {
      const lines = await prisma.payrollJournalEntryLine.findMany({
        where: { journalEntryId: journalId },
        orderBy: { id: 'asc' },
      });
      const sum = (pick: 'debitAmount' | 'creditAmount') =>
        lines.reduce((total, line) => total + Number(line[pick] ?? 0), 0);
      return { lines, debit: sum('debitAmount'), credit: sum('creditAmount') };
    };

    it('reverses a POSTED journal into a second journal for the same run, balanced and linked', async () => {
      const fx = await newRun(beta, {
        ...earnings,
        journal: PayrollJournalEntryStatus.POSTED,
      });
      const original = await lineTotals(fx.journalId as string);
      const originalBefore = snap(
        await prisma.payrollJournalEntry.findUniqueOrThrow({
          where: { id: fx.journalId as string },
        }),
      );
      const auditBefore = await prisma.auditLog.count({
        where: { tenantId: beta.tenantId, entityId: fx.journalId },
      });

      const res = await call(
        'post',
        beta.admin,
        `payroll/runs/${fx.runId}/journal/reverse`,
        { reason: 'posted in error' },
      );
      expectOk(res);

      const journals = await prisma.payrollJournalEntry.findMany({
        where: { payrollRunId: fx.runId },
        orderBy: { createdAt: 'asc' },
      });
      expect(journals.map((j) => j.journalType).sort()).toEqual([
        'ORIGINAL',
        'REVERSAL',
      ]);
      const reversal = journals.find((j) => j.journalType === 'REVERSAL');
      const orig = journals.find((j) => j.journalType === 'ORIGINAL');
      expect(reversal?.originalJournalId).toBe(fx.journalId);
      expect(orig?.reversalJournalId).toBe(reversal?.id);
      expect(reversal?.tenantId).toBe(beta.tenantId);

      // Mirror image: every debit becomes a credit of the same amount, so the
      // reversal balances and exactly offsets the original.
      const mirrored = await lineTotals(reversal?.id as string);
      expect(mirrored.lines).toHaveLength(original.lines.length);
      expect(mirrored.debit).toBeCloseTo(original.credit, 2);
      expect(mirrored.credit).toBeCloseTo(original.debit, 2);
      expect(mirrored.debit).toBeCloseTo(mirrored.credit, 2);
      expect(mirrored.debit).toBeGreaterThan(0);

      // The original's lines are untouched and its audit history only grew.
      const originalAfter = await lineTotals(fx.journalId as string);
      expect(snap(originalAfter.lines)).toEqual(snap(original.lines));
      const after = snap(
        await prisma.payrollJournalEntry.findUniqueOrThrow({
          where: { id: fx.journalId as string },
        }),
      ) as Record<string, unknown>;
      const before = originalBefore as Record<string, unknown>;
      for (const key of Object.keys(before)) {
        if (
          [
            'reversalJournalId',
            'reversedAt',
            'reversedBy',
            'reversalReason',
            'updatedAt',
            'status',
          ].includes(key)
        ) {
          continue;
        }
        expect({ key, value: after[key] }).toEqual({ key, value: before[key] });
      }
      expect(
        await prisma.auditLog.count({
          where: { tenantId: beta.tenantId, entityId: fx.journalId },
        }),
      ).toBeGreaterThanOrEqual(auditBefore);
      // And the reversal itself is on the record (the write is not awaited by the
      // request, so poll for it).
      let reversedAudit = null;
      for (let attempt = 0; attempt < 20 && !reversedAudit; attempt += 1) {
        reversedAudit = await prisma.auditLog.findFirst({
          where: {
            tenantId: beta.tenantId,
            entityId: fx.journalId,
            action: 'PAYROLL_JOURNAL_REVERSED',
          },
        });
        if (!reversedAudit) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
      expect(reversedAudit).not.toBeNull();
    });

    it('two simultaneous reversals of one journal create exactly one reversal (the row lock replaces the dropped unique index)', async () => {
      const fx = await newRun(beta, {
        ...earnings,
        journal: PayrollJournalEntryStatus.POSTED,
      });
      const attempt = () =>
        call('post', beta.admin, `payroll/runs/${fx.runId}/journal/reverse`, {
          reason: 'concurrent',
        });
      const results = await Promise.all([attempt(), attempt(), attempt()]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409, 409]);
      expect(
        await prisma.payrollJournalEntry.count({
          where: { payrollRunId: fx.runId, journalType: 'REVERSAL' },
        }),
      ).toBe(1);
      expect(
        await prisma.payrollJournalEntry.count({
          where: { payrollRunId: fx.runId },
        }),
      ).toBe(2);
    });

    it('two simultaneous generates for one run create exactly one ORIGINAL journal', async () => {
      const fx = await newRun(beta, {
        status: PayrollRunStatus.CALCULATED,
        employee: true,
      });
      const attempt = () =>
        call('post', beta.admin, `payroll/runs/${fx.runId}/journal/generate`);
      const results = await Promise.all([attempt(), attempt(), attempt()]);
      for (const res of results) {
        expect({ status: res.status, body: brief(res) }).toEqual({
          status: 201,
          body: expect.any(String) as string,
        });
      }
      expect(
        await prisma.payrollJournalEntry.count({
          where: {
            payrollRunId: fx.runId,
            journalType: 'ORIGINAL',
            originalJournalId: null,
          },
        }),
      ).toBe(1);
    });

    it('refuses a second reversal of the same journal with 409 and creates no third journal', async () => {
      const fx = await newRun(beta, {
        ...earnings,
        journal: PayrollJournalEntryStatus.POSTED,
      });
      const first = await call(
        'post',
        beta.admin,
        `payroll/runs/${fx.runId}/journal/reverse`,
        { reason: 'first' },
      );
      expectOk(first);
      const second = await call(
        'post',
        beta.admin,
        `payroll/runs/${fx.runId}/journal/reverse`,
        { reason: 'second' },
      );
      expectStatus(second, 409);
      expect(
        await prisma.payrollJournalEntry.count({
          where: { payrollRunId: fx.runId },
        }),
      ).toBe(2);
    });

    it('lets an ADJUSTMENT journal coexist with the original for one run', async () => {
      const fx = await newRun(beta, {
        ...earnings,
        journal: PayrollJournalEntryStatus.POSTED,
      });
      // No service path creates an adjustment today; this proves the database no
      // longer forbids one (the schema documents that they coexist).
      await prisma.payrollJournalEntry.create({
        data: {
          tenantId: beta.tenantId,
          payrollRunId: fx.runId,
          journalType: 'ADJUSTMENT',
          status: PayrollJournalEntryStatus.GENERATED,
          journalNumber: `ADJ-${beta.marker}-${(seq += 1)}`,
          originalJournalId: fx.journalId,
        },
      });
      const list = await call(
        'get',
        beta.admin,
        `payroll/runs/${fx.runId}/journals`,
      );
      expectOk(list);
      expect(
        await prisma.payrollJournalEntry.count({
          where: { payrollRunId: fx.runId },
        }),
      ).toBe(2);
    });

    it("reversing BETA's journal leaves ALPHA's payroll exactly as it was", async () => {
      const alphaFx = await newRun(alpha, {
        ...earnings,
        journal: PayrollJournalEntryStatus.POSTED,
      });
      const betaFx = await newRun(beta, {
        ...earnings,
        journal: PayrollJournalEntryStatus.POSTED,
      });
      const alphaBefore = await runState(alphaFx.runId);
      expectOk(
        await call(
          'post',
          beta.admin,
          `payroll/runs/${betaFx.runId}/journal/reverse`,
          { reason: 'beta only' },
        ),
      );
      expect(await runState(alphaFx.runId)).toEqual(alphaBefore);
    });

    it("ALPHA's admin cannot reverse BETA's POSTED journal, and BETA's rows are unchanged", async () => {
      const fx = await newRun(beta, {
        ...earnings,
        journal: PayrollJournalEntryStatus.POSTED,
      });
      const before = await runState(fx.runId);
      const res = await call(
        'post',
        alpha.admin,
        `payroll/runs/${fx.runId}/journal/reverse`,
        { reason: 'attack' },
      );
      expectStatus(res, 404);
      expect(await runState(fx.runId)).toEqual(before);
      expect(
        await prisma.payrollJournalEntry.count({
          where: { payrollRunId: fx.runId },
        }),
      ).toBe(1);
    });
  });
  // --------------------------------------------------------- 4. payslips

  describe('payslips', () => {
    const payslipCase = (
      name: string,
      method: Method,
      suffixPath: string,
      status: PayslipStatus,
      extra: Partial<Case<RunFx>> = {},
    ) =>
      runCase(
        name,
        method,
        (f) => `payslips/${f.payslipId}${suffixPath}`,
        { ...earnings, payslip: status },
        extra,
      );
    defineCases<RunFx>([
      payslipCase('payslips/:id', 'get', '', PayslipStatus.GENERATED, {
        contains: (o) => [`PSL-${o.marker}`, o.netPay],
      }),
      payslipCase(
        'payslips/:id/publish',
        'post',
        '/publish',
        PayslipStatus.GENERATED,
      ),
      payslipCase(
        'payslips/:id/void',
        'post',
        '/void',
        PayslipStatus.GENERATED,
        {
          body: () => ({ reason: 'issued in error' }),
        },
      ),
      payslipCase(
        'payslips/:id/regenerate',
        'post',
        '/regenerate',
        PayslipStatus.GENERATED,
      ),
      payslipCase(
        'payslips/:id/deliver',
        'post',
        '/deliver',
        PayslipStatus.PUBLISHED,
      ),
      payslipCase(
        'payslips/:id/download',
        'get',
        '/download',
        PayslipStatus.GENERATED,
        { format: 'binary' },
      ),
      runCase(
        'payslips/generate/run/:payrollRunId',
        'post',
        (f) => `payslips/generate/run/${f.runId}`,
        { ...earnings },
      ),
      runCase(
        'payslips/generate/run-employee/:payrollRunEmployeeId',
        'post',
        (f) => `payslips/generate/run-employee/${f.runEmployeeId}`,
        { ...earnings },
      ),
    ]);
  });

  // ----------------------------------------- 5. calendars, periods, GL, bank

  interface CalendarFx {
    id: string;
  }
  let catalogSeq = 0;

  describe('payroll calendars and periods', () => {
    const makeCalendar = async (s: Side): Promise<CalendarFx> => {
      catalogSeq += 1;
      const calendar = await prisma.payrollCalendar.create({
        data: {
          tenantId: s.tenantId,
          name: `Calendar ${s.marker} ${catalogSeq}`,
          frequency: 'MONTHLY',
          currencyCode: 'USD',
        },
        select: { id: true },
      });
      return calendar;
    };
    const makePeriod = async (s: Side): Promise<CalendarFx> => {
      catalogSeq += 1;
      const period = await prisma.payrollPeriod.create({
        data: {
          tenantId: s.tenantId,
          payrollCalendarId: s.calendarId,
          name: `Period ${s.marker} ${catalogSeq}`,
          periodStart: new Date(
            Date.UTC(2040 + Math.floor(catalogSeq / 12), catalogSeq % 12, 1),
          ),
          periodEnd: new Date(
            Date.UTC(2040 + Math.floor(catalogSeq / 12), catalogSeq % 12, 28),
          ),
        },
        select: { id: true },
      });
      return period;
    };
    const calendarState = async (f: CalendarFx) =>
      snap(await prisma.payrollCalendar.findUnique({ where: { id: f.id } }));
    const periodState = async (f: CalendarFx) =>
      snap(await prisma.payrollPeriod.findUnique({ where: { id: f.id } }));

    defineCases<CalendarFx>([
      {
        name: 'payroll/calendars/:id',
        method: 'get',
        make: makeCalendar,
        path: (f) => `payroll/calendars/${f.id}`,
        snapshot: calendarState,
        contains: (o) => [`Calendar ${o.marker}`],
      },
      {
        name: 'payroll/calendars/:id',
        method: 'patch',
        make: makeCalendar,
        path: (f) => `payroll/calendars/${f.id}`,
        body: () => ({ name: 'HIJACKED' }),
        snapshot: calendarState,
      },
    ]);
    defineCases<CalendarFx>([
      {
        name: 'payroll/periods/:id',
        method: 'get',
        make: makePeriod,
        path: (f) => `payroll/periods/${f.id}`,
        snapshot: periodState,
        contains: (o) => [`Period ${o.marker}`],
      },
      {
        name: 'payroll/periods/:id',
        method: 'patch',
        make: makePeriod,
        path: (f) => `payroll/periods/${f.id}`,
        body: () => ({ name: 'HIJACKED' }),
        snapshot: periodState,
      },
    ]);

    it('control: ALPHA creates a period under its OWN calendar', async () => {
      const res = await call('post', alpha.admin, 'payroll/periods', {
        payrollCalendarId: alpha.calendarId,
        name: `New period ${suffix}`,
        periodStart: '2035-01-01',
        periodEnd: '2035-01-31',
      });
      expectStatus(res, 201);
    });

    it('cannot create a period under a BETA calendar, and BETA gains no period', async () => {
      const before = await prisma.payrollPeriod.count({
        where: { tenantId: beta.tenantId },
      });
      const res = await call('post', alpha.admin, 'payroll/periods', {
        payrollCalendarId: beta.calendarId,
        name: 'Planted',
        periodStart: '2035-02-01',
        periodEnd: '2035-02-28',
      });
      expectStatus(res, 404);
      expect(
        await prisma.payrollPeriod.count({
          where: { tenantId: beta.tenantId },
        }),
      ).toBe(before);
      expect(
        await prisma.payrollPeriod.count({ where: { name: 'Planted' } }),
      ).toBe(0);
    });

    it('control: ALPHA creates a run for its OWN open period', async () => {
      const period = await makePeriod(alpha);
      const res = await call('post', alpha.admin, 'payroll/runs', {
        payrollPeriodId: period.id,
        notes: 'own',
      });
      expectStatus(res, 201);
    });

    it('cannot create a run for a BETA period, and BETA gains no run', async () => {
      const period = await makePeriod(beta);
      const before = await prisma.payrollRun.count({
        where: { tenantId: beta.tenantId },
      });
      const res = await call('post', alpha.admin, 'payroll/runs', {
        payrollPeriodId: period.id,
        notes: 'planted',
      });
      expectStatus(res, 404);
      expect(
        await prisma.payrollRun.count({ where: { tenantId: beta.tenantId } }),
      ).toBe(before);
    });

    it("an ALPHA run created with a BETA employer bank account id persists nothing of BETA's", async () => {
      const period = await makePeriod(alpha);
      const before = snap(
        await prisma.employerBankAccount.findUnique({
          where: { id: beta.employerAccountId },
        }),
      );
      const res = await call('post', alpha.admin, 'payroll/runs', {
        payrollPeriodId: period.id,
        employerBankAccountId: beta.employerAccountId,
      });
      // The run model carries no bank-account link; the id must not be echoed
      // or stored anywhere, and BETA's account must be untouched.
      expect(res.status).toBe(201);
      expectNoBeta(textOf(res));
      expect(textOf(res)).not.toContain(beta.employerAccountId);
      expect(
        snap(
          await prisma.employerBankAccount.findUnique({
            where: { id: beta.employerAccountId },
          }),
        ),
      ).toEqual(before);
    });

    it('control: ALPHA binds its calendar to its OWN business unit', async () => {
      const calendar = await makeCalendar(alpha);
      const res = await call(
        'patch',
        alpha.admin,
        `payroll/calendars/${calendar.id}`,
        {
          businessUnitId: alpha.unitId,
        },
      );
      expectOk(res);
    });

    it('cannot bind its calendar to a BETA business unit', async () => {
      const calendar = await makeCalendar(alpha);
      const before = await calendarState(calendar);
      const res = await call(
        'patch',
        alpha.admin,
        `payroll/calendars/${calendar.id}`,
        {
          businessUnitId: beta.unitId,
        },
      );
      expectStatus(res, 400);
      expect(await calendarState(calendar)).toEqual(before);
    });

    it('cannot create a calendar in a BETA business unit', async () => {
      const res = await call('post', alpha.admin, 'payroll/calendars', {
        name: `Planted calendar ${suffix}`,
        frequency: 'MONTHLY',
        currencyCode: 'USD',
        isDefault: false,
        businessUnitId: beta.unitId,
      });
      expectStatus(res, 400);
      expect(
        await prisma.payrollCalendar.count({
          where: { name: `Planted calendar ${suffix}` },
        }),
      ).toBe(0);
    });

    it('cannot add an adjustment for a BETA employee to its own run', async () => {
      const own = await newRun(alpha, { employee: true });
      const res = await call(
        'post',
        alpha.admin,
        `payroll/runs/${own.runId}/adjustments`,
        {
          employeeId: beta.employeeId,
          label: 'Planted',
          amount: 10,
          currencyCode: 'USD',
        },
      );
      expect(res.status).toBe(400);
      expect(
        await prisma.payrollAdjustment.count({ where: { label: 'Planted' } }),
      ).toBe(0);
    });
  });

  // ------------------------------------------------- 6. GL and posting rules

  describe('GL accounts and posting rules', () => {
    let glSeq = 0;
    const makeGl = async (s: Side): Promise<CalendarFx> => {
      glSeq += 1;
      return prisma.payrollGlAccount.create({
        data: {
          tenantId: s.tenantId,
          code: `GL-${s.marker}-${glSeq}`,
          name: `Account ${s.marker} ${glSeq}`,
          accountType: 'EXPENSE',
        },
        select: { id: true },
      });
    };
    const makeRule = async (s: Side): Promise<CalendarFx> => {
      glSeq += 1;
      return prisma.payrollPostingRule.create({
        data: {
          tenantId: s.tenantId,
          code: `PR-${s.marker}-${glSeq}`,
          name: `Rule ${s.marker} ${glSeq}`,
          sourceCategory: 'EARNING',
          debitAccountId: s.glDebitId,
          creditAccountId: s.glCreditId,
          effectiveFrom: new Date('2020-01-01'),
        },
        select: { id: true },
      });
    };
    const glState = async (f: CalendarFx) =>
      snap(await prisma.payrollGlAccount.findUnique({ where: { id: f.id } }));
    const ruleState = async (f: CalendarFx) =>
      snap(await prisma.payrollPostingRule.findUnique({ where: { id: f.id } }));

    defineCases<CalendarFx>([
      {
        name: 'payroll/gl-accounts/:id',
        method: 'get',
        make: makeGl,
        path: (f) => `payroll/gl-accounts/${f.id}`,
        snapshot: glState,
        contains: (o) => [`Account ${o.marker}`],
      },
      {
        name: 'payroll/gl-accounts/:id',
        method: 'patch',
        make: makeGl,
        path: (f) => `payroll/gl-accounts/${f.id}`,
        body: () => ({ name: 'HIJACKED' }),
        snapshot: glState,
      },
      {
        name: 'payroll/gl-accounts/:id',
        method: 'delete',
        make: makeGl,
        path: (f) => `payroll/gl-accounts/${f.id}`,
        snapshot: glState,
      },
      {
        name: 'payroll/posting-rules/:id',
        method: 'get',
        make: makeRule,
        path: (f) => `payroll/posting-rules/${f.id}`,
        snapshot: ruleState,
        contains: (o) => [`Rule ${o.marker}`],
      },
      {
        name: 'payroll/posting-rules/:id',
        method: 'patch',
        make: makeRule,
        path: (f) => `payroll/posting-rules/${f.id}`,
        body: () => ({ name: 'HIJACKED' }),
        snapshot: ruleState,
      },
      {
        name: 'payroll/posting-rules/:id',
        method: 'delete',
        make: makeRule,
        path: (f) => `payroll/posting-rules/${f.id}`,
        snapshot: ruleState,
      },
    ]);

    it('control: ALPHA creates a GL account with its OWN parent', async () => {
      const res = await call('post', alpha.admin, 'payroll/gl-accounts', {
        name: `Child ${suffix}`,
        accountType: 'EXPENSE',
        parentAccountId: alpha.glDebitId,
      });
      expectStatus(res, 201);
    });

    it('cannot create a GL account under a BETA parent account or organization', async () => {
      for (const body of [
        { parentAccountId: beta.glDebitId },
        { organizationId: beta.organizationId },
      ]) {
        const res = await call('post', alpha.admin, 'payroll/gl-accounts', {
          name: `Planted GL ${suffix}`,
          accountType: 'EXPENSE',
          ...body,
        });
        expectStatus(res, 400);
      }
      expect(
        await prisma.payrollGlAccount.count({
          where: { name: `Planted GL ${suffix}` },
        }),
      ).toBe(0);
    });

    it('cannot re-parent its own GL account onto a BETA account', async () => {
      const own = await makeGl(alpha);
      const before = await glState(own);
      const res = await call(
        'patch',
        alpha.admin,
        `payroll/gl-accounts/${own.id}`,
        {
          parentAccountId: beta.glDebitId,
        },
      );
      expectStatus(res, 400);
      expect(await glState(own)).toEqual(before);
    });

    it('control: ALPHA creates a posting rule on its OWN accounts', async () => {
      const res = await call('post', alpha.admin, 'payroll/posting-rules', {
        name: `Own rule ${suffix}`,
        sourceCategory: 'EARNING',
        effectiveFrom: '2024-01-01',
        debitAccountId: alpha.glDebitId,
        creditAccountId: alpha.glCreditId,
      });
      expectStatus(res, 201);
    });

    it('cannot create a posting rule on BETA accounts or in a BETA business unit', async () => {
      for (const body of [
        { debitAccountId: beta.glDebitId, creditAccountId: alpha.glCreditId },
        { debitAccountId: alpha.glDebitId, creditAccountId: beta.glCreditId },
        {
          debitAccountId: alpha.glDebitId,
          creditAccountId: alpha.glCreditId,
          businessUnitId: beta.unitId,
        },
      ]) {
        const res = await call('post', alpha.admin, 'payroll/posting-rules', {
          name: `Planted rule ${suffix}`,
          sourceCategory: 'EARNING',
          effectiveFrom: '2024-01-01',
          ...body,
        });
        expectStatus(res, 400);
      }
      expect(
        await prisma.payrollPostingRule.count({
          where: { name: `Planted rule ${suffix}` },
        }),
      ).toBe(0);
    });

    it('cannot point its own posting rule at a BETA account', async () => {
      const own = await makeRule(alpha);
      const before = await ruleState(own);
      const res = await call(
        'patch',
        alpha.admin,
        `payroll/posting-rules/${own.id}`,
        { creditAccountId: beta.glCreditId },
      );
      expectStatus(res, 400);
      expect(await ruleState(own)).toEqual(before);
    });

    it('preview-resolution: BETA resolves its own rule, ALPHA never sees it', async () => {
      const body = {
        sourceCategory: 'EARNING',
        effectiveDate: '2024-06-01',
      };
      const own = await call(
        'post',
        beta.admin,
        'payroll/posting-rules/preview-resolution',
        body,
      );
      expectOk(own);
      expect(textOf(own)).toContain(beta.ruleCode);
      const attack = await call(
        'post',
        alpha.admin,
        'payroll/posting-rules/preview-resolution',
        body,
      );
      expectOk(attack);
      expect(textOf(attack)).toContain(alpha.ruleCode);
      expectNoBeta(textOf(attack));
      expect(textOf(attack)).not.toContain(beta.ruleCode);
    });
  });

  // ------------------------------------------------- 7. employer bank accounts

  describe('employer bank accounts', () => {
    interface BankFx {
      id: string;
      number: string;
    }
    let bankSeq = 0;
    const makeBank = async (s: Side): Promise<BankFx> => {
      bankSeq += 1;
      const number = `NUM${bankSeq}${s.marker}`;
      const account = await prisma.employerBankAccount.create({
        data: {
          tenantId: s.tenantId,
          accountName: `Account ${s.marker} ${bankSeq}`,
          accountTitle: `Holder ${s.marker} ${bankSeq}`,
          accountNumber: number,
          currencyCode: 'USD',
        },
        select: { id: true },
      });
      return { id: account.id, number };
    };
    // Every employer account of both tenants: set-default also flips siblings.
    const bankState = async (): Promise<unknown> =>
      snap(
        await prisma.employerBankAccount.findMany({
          where: { tenantId: { in: [alpha.tenantId, beta.tenantId] } },
          orderBy: { id: 'asc' },
        }),
      );
    const bankCase = (
      method: Method,
      path: (f: BankFx) => string,
      extra: Partial<Case<BankFx>> = {},
    ): Case<BankFx> => ({
      name: 'payroll/employer-bank-accounts/:id',
      method,
      make: makeBank,
      path,
      snapshot: bankState,
      ...extra,
    });
    const base = 'payroll/employer-bank-accounts';

    defineCases<BankFx>([
      bankCase('get', (f) => `${base}/${f.id}`, {
        contains: (o) => [`Account ${o.marker}`],
      }),
      bankCase('patch', (f) => `${base}/${f.id}`, {
        body: () => ({
          accountName: 'HIJACKED',
          accountTitle: 'HIJACKED',
          currencyCode: 'USD',
        }),
      }),
      {
        ...bankCase('post', (f) => `${base}/${f.id}/deactivate`),
        name: 'payroll/employer-bank-accounts/:id/deactivate',
      },
      {
        ...bankCase('post', (f) => `${base}/${f.id}/set-default-payroll`),
        name: 'payroll/employer-bank-accounts/:id/set-default-payroll',
      },
    ]);

    it('lists only its own accounts', async () => {
      const own = await call('get', beta.admin, base);
      expectOk(own);
      expect(textOf(own)).toContain(beta.employerAccountName);
      const res = await call('get', alpha.admin, base);
      expectOk(res);
      const ids = listItems(res).map((row) => row.id);
      expect(ids).toContain(alpha.employerAccountId);
      expect(ids).not.toContain(beta.employerAccountId);
      expect(ids).toHaveLength(
        await prisma.employerBankAccount.count({
          where: { tenantId: alpha.tenantId },
        }),
      );
      expectNoBeta(textOf(res));
      expect(textOf(res)).not.toContain(beta.employerAccountName);
    });

    it('search cannot reach BETA accounts', async () => {
      const own = await call(
        'get',
        beta.admin,
        `${base}?search=${beta.marker}`,
      );
      expectOk(own);
      expect(textOf(own)).toContain(beta.employerAccountName);
      const res = await call(
        'get',
        alpha.admin,
        `${base}?search=${beta.marker}`,
      );
      expectOk(res);
      expect(listItems(res)).toHaveLength(0);
    });

    it('CSV export carries only its own accounts (BETA export control)', async () => {
      const own = await call('get', beta.admin, `${base}/actions/export`);
      expectOk(own);
      expect(textOf(own)).toContain(beta.employerAccountNumber);
      const res = await call('get', alpha.admin, `${base}/actions/export`);
      expectOk(res);
      expect(textOf(res)).toContain(alpha.employerAccountNumber);
      expectNoBeta(textOf(res));
      expect(textOf(res)).not.toContain(beta.employerAccountName);
    });

    it('control: ALPHA creates an account with its OWN bank', async () => {
      const res = await call('post', alpha.admin, base, {
        accountName: `Own bank ${suffix}`,
        accountTitle: 'Holder',
        currencyCode: 'USD',
        bankId: alpha.bankId,
      });
      expectStatus(res, 201);
    });

    it('cannot create or retarget an account onto a BETA bank', async () => {
      const create = await call('post', alpha.admin, base, {
        accountName: `Planted bank ${suffix}`,
        accountTitle: 'Holder',
        currencyCode: 'USD',
        bankId: beta.bankId,
      });
      expectStatus(create, 400);
      expect(
        await prisma.employerBankAccount.count({
          where: { accountName: `Planted bank ${suffix}` },
        }),
      ).toBe(0);
      const own = await makeBank(alpha);
      const before = await bankState();
      const patch = await call('patch', alpha.admin, `${base}/${own.id}`, {
        accountName: `Account ${alpha.marker} retarget`,
        accountTitle: 'Holder',
        currencyCode: 'USD',
        bankId: beta.bankId,
      });
      expectStatus(patch, 400);
      expect(await bankState()).toEqual(before);
    });

    it('import cannot target a BETA bank by id or code', async () => {
      const before = await prisma.employerBankAccount.count({
        where: { tenantId: beta.tenantId },
      });
      const res = await call('post', alpha.admin, `${base}/actions/import`, [
        {
          accountName: `Imported ${suffix}`,
          accountTitle: 'Holder',
          currencyCode: 'USD',
          bankId: beta.bankId,
        },
      ]);
      expectStatus(res, 400);
      expect(
        await prisma.employerBankAccount.count({
          where: { tenantId: beta.tenantId },
        }),
      ).toBe(before);
      expect(
        await prisma.employerBankAccount.count({
          where: { accountName: `Imported ${suffix}` },
        }),
      ).toBe(0);
    });
  });

  // ----------------------------------------------------------- 8. lists

  describe('list endpoints and exports exclude BETA', () => {
    const lists: Array<{
      path: string;
      count: () => Promise<number>;
      betaId: () => string;
    }> = [
      {
        path: 'payroll/calendars',
        count: () =>
          prisma.payrollCalendar.count({ where: { tenantId: alpha.tenantId } }),
        betaId: () => beta.calendarId,
      },
      {
        path: 'payroll/periods',
        count: () =>
          prisma.payrollPeriod.count({ where: { tenantId: alpha.tenantId } }),
        betaId: () => beta.periodId,
      },
      {
        path: 'payroll/runs',
        count: () =>
          prisma.payrollRun.count({ where: { tenantId: alpha.tenantId } }),
        betaId: () => beta.main.runId,
      },
      {
        path: 'payroll/gl-accounts',
        count: () =>
          prisma.payrollGlAccount.count({
            where: { tenantId: alpha.tenantId },
          }),
        betaId: () => beta.glDebitId,
      },
      {
        path: 'payroll/posting-rules',
        count: () =>
          prisma.payrollPostingRule.count({
            where: { tenantId: alpha.tenantId },
          }),
        betaId: () => beta.ruleId,
      },
      {
        path: 'payslips',
        count: () =>
          prisma.payslip.count({ where: { tenantId: alpha.tenantId } }),
        betaId: () => beta.main.payslipId ?? '',
      },
    ];

    it.each(lists)(
      '$path: BETA sees its own row, ALPHA sees only its own tenant',
      async ({ path, count, betaId }) => {
        const own = await call('get', beta.admin, path);
        expectOk(own);
        expect(listItems(own).map((row) => row.id)).toContain(betaId());
        const res = await call('get', alpha.admin, path);
        expectOk(res);
        const items = listItems(res);
        expect(items.map((row) => row.id)).not.toContain(betaId());
        expect(items).toHaveLength(await count());
        expectNoBeta(textOf(res));
      },
    );

    it('payslips filtered by a BETA run or BETA employee return nothing for ALPHA', async () => {
      for (const query of [
        `payrollRunId=${beta.main.runId}`,
        `employeeId=${beta.employeeId}`,
      ]) {
        const own = await call('get', beta.admin, `payslips?${query}`);
        expectOk(own);
        expect(listItems(own).length).toBeGreaterThan(0);
        const res = await call('get', alpha.admin, `payslips?${query}`);
        expectOk(res);
        expect(listItems(res)).toHaveLength(0);
      }
    });

    it('payroll runs filtered by a BETA period return nothing for ALPHA', async () => {
      const own = await call(
        'get',
        beta.admin,
        `payroll/runs?payrollPeriodId=${beta.periodId}`,
      );
      expectOk(own);
      expect(listItems(own).length).toBeGreaterThan(0);
      const res = await call(
        'get',
        alpha.admin,
        `payroll/runs?payrollPeriodId=${beta.periodId}`,
      );
      expectOk(res);
      expect(listItems(res)).toHaveLength(0);
    });

    it('operations dashboard and exception lists never show BETA', async () => {
      const own = await call('get', beta.admin, 'payroll/operations/dashboard');
      expectOk(own);
      expect(textOf(own)).toContain(beta.marker);
      const dash = await call(
        'get',
        alpha.admin,
        'payroll/operations/dashboard',
      );
      expectOk(dash);
      expectNoBeta(textOf(dash));

      const ownEx = await call(
        'get',
        beta.admin,
        `payroll/operations/exceptions?runId=${beta.main.runId}`,
      );
      expectOk(ownEx);
      expect(textOf(ownEx)).toContain(`Issue ${beta.marker}`);
      const ex = await call(
        'get',
        alpha.admin,
        `payroll/operations/exceptions?runId=${beta.main.runId}`,
      );
      expectOk(ex);
      expect(listItems(ex)).toHaveLength(0);
      expectNoBeta(textOf(ex));
    });

    it('exception CSV export for a BETA run is empty for ALPHA', async () => {
      const own = await call(
        'get',
        beta.admin,
        `payroll/operations/exceptions/export?runId=${beta.main.runId}`,
      );
      expectOk(own);
      expect(textOf(own)).toContain(`Issue ${beta.marker}`);
      const res = await call(
        'get',
        alpha.admin,
        `payroll/operations/exceptions/export?runId=${beta.main.runId}`,
      );
      expectOk(res);
      expectNoBeta(textOf(res));
    });

    it.each(['payroll-register', 'bank-payment', 'component-summary'])(
      'report %s (JSON and CSV export) never shows BETA to ALPHA',
      async (reportType) => {
        const query = `reportType=${reportType}&runId=${beta.main.runId}`;
        const own = await call(
          'get',
          beta.admin,
          `payroll/operations/reports?${query}`,
        );
        expectOk(own);
        const exportOwn = await call(
          'get',
          beta.admin,
          `payroll/operations/reports/export?${query}`,
        );
        expectOk(exportOwn);
        const res = await call(
          'get',
          alpha.admin,
          `payroll/operations/reports?${query}`,
        );
        expectOk(res);
        expectNoBeta(textOf(res));
        const exported = await call(
          'get',
          alpha.admin,
          `payroll/operations/reports/export?${query}`,
        );
        expectOk(exported);
        expectNoBeta(textOf(exported));
        // Unfiltered: ALPHA's own report must not fold BETA rows in either.
        const all = await call(
          'get',
          alpha.admin,
          `payroll/operations/reports?reportType=${reportType}`,
        );
        expectOk(all);
        expectNoBeta(textOf(all));
      },
    );

    it('reports control: BETA payroll register shows its own employee', async () => {
      const own = await call(
        'get',
        beta.admin,
        `payroll/operations/reports?reportType=payroll-register&runId=${beta.main.runId}`,
      );
      expectOk(own);
      expect(textOf(own)).toContain(beta.marker);
    });
  });

  // ------------------------------------------------------- 9. /me/payslips

  describe('/me/payslips only shows the caller own payslips', () => {
    it('control: each admin reads its own published payslip and the list', async () => {
      for (const s of [alpha, beta]) {
        const list = await call('get', s.admin, 'me/payslips');
        expectOk(list);
        expect(textOf(list)).toContain(`PSL-${s.marker}`);
        const one = await call(
          'get',
          s.admin,
          `me/payslips/${s.main.payslipId}`,
        );
        expectOk(one);
        expect(textOf(one)).toContain(s.main.payslipId);
        const dl = await callBinary(
          'get',
          s.admin,
          `me/payslips/${s.main.payslipId}/download`,
        );
        expectOk(dl);
      }
    });

    it('the list holds only the caller employee payslips, never another employee or tenant', async () => {
      const res = await call('get', alpha.admin, 'me/payslips');
      expectOk(res);
      const ids = listItems(res).map((row) => row.id);
      expect(ids).toContain(alpha.main.payslipId);
      expect(ids).not.toContain(alpha.otherPayslipId);
      expect(ids).not.toContain(beta.main.payslipId);
      expect(ids).not.toContain(beta.otherPayslipId);
      expectNoBeta(textOf(res));
    });

    it('cannot read or download a BETA payslip, or a colleague payslip, via /me', async () => {
      const targets = [
        beta.main.payslipId,
        beta.otherPayslipId,
        alpha.otherPayslipId,
      ];
      for (const id of targets) {
        const before = snap(
          await prisma.payslip.findUnique({ where: { id: id ?? '' } }),
        );
        const one = await call('get', alpha.admin, `me/payslips/${id}`);
        expectStatus(one, 404);
        expectNoBeta(textOf(one));
        const dl = await callBinary(
          'get',
          alpha.admin,
          `me/payslips/${id}/download`,
        );
        expectStatus(dl, 404);
        expect(
          snap(await prisma.payslip.findUnique({ where: { id: id ?? '' } })),
        ).toEqual(before);
      }
    });

    it('a colleague payslip is reachable by its owner only through the HR route', async () => {
      // Same tenant admin holds payslips.read-all, so this is a scope check,
      // not an isolation one: it proves the 404 above is /me's own filter.
      const res = await call(
        'get',
        alpha.admin,
        `payslips/${alpha.otherPayslipId}`,
      );
      expectOk(res);
    });
  });

  // ----------------------------------------------------- 10. mass assignment

  describe('mass assignment is rejected (forbidNonWhitelisted)', () => {
    const forged = (): Array<Record<string, string>> => [
      { tenantId: beta.tenantId },
      { id: randomUUID() },
      { createdById: beta.admin.id },
    ];
    const creates: Array<{
      path: string;
      body: () => Record<string, unknown>;
      count: () => Promise<number>;
    }> = [
      {
        path: 'payroll/calendars',
        body: () => ({
          name: `Mass calendar ${suffix}`,
          frequency: 'MONTHLY',
          currencyCode: 'USD',
          isDefault: false,
        }),
        count: () =>
          prisma.payrollCalendar.count({
            where: { name: `Mass calendar ${suffix}` },
          }),
      },
      {
        path: 'payroll/periods',
        body: () => ({
          payrollCalendarId: alpha.calendarId,
          name: `Mass period ${suffix}`,
          periodStart: '2036-01-01',
          periodEnd: '2036-01-31',
        }),
        count: () =>
          prisma.payrollPeriod.count({
            where: { name: `Mass period ${suffix}` },
          }),
      },
      {
        path: 'payroll/runs',
        body: () => ({
          payrollPeriodId: alpha.periodId,
          notes: `Mass ${suffix}`,
        }),
        count: () =>
          prisma.payrollRun.count({ where: { notes: `Mass ${suffix}` } }),
      },
      {
        path: 'payroll/gl-accounts',
        body: () => ({ name: `Mass GL ${suffix}`, accountType: 'EXPENSE' }),
        count: () =>
          prisma.payrollGlAccount.count({
            where: { name: `Mass GL ${suffix}` },
          }),
      },
      {
        path: 'payroll/posting-rules',
        body: () => ({
          name: `Mass rule ${suffix}`,
          sourceCategory: 'EARNING',
          effectiveFrom: '2024-01-01',
          debitAccountId: alpha.glDebitId,
          creditAccountId: alpha.glCreditId,
        }),
        count: () =>
          prisma.payrollPostingRule.count({
            where: { name: `Mass rule ${suffix}` },
          }),
      },
      {
        path: 'payroll/employer-bank-accounts',
        body: () => ({
          accountName: `Mass account ${suffix}`,
          accountTitle: 'Holder',
          currencyCode: 'USD',
        }),
        count: () =>
          prisma.employerBankAccount.count({
            where: { accountName: `Mass account ${suffix}` },
          }),
      },
    ];

    it.each(creates)(
      '$path rejects tenantId, id and createdById',
      async (c) => {
        const clean = await call('post', alpha.admin, c.path, c.body());
        // Control: the same body without forged fields is accepted, so the 400s
        // below are about the forged fields and nothing else.
        expectStatus(clean, 201);
        const created = await c.count();
        expect(created).toBe(1);
        for (const extra of forged()) {
          const res = await call('post', alpha.admin, c.path, {
            ...c.body(),
            ...extra,
          });
          expectStatus(res, 400);
        }
        expect(await c.count()).toBe(created);
      },
    );

    it('PATCH bodies reject tenantId as well', async () => {
      const targets = [
        `payroll/calendars/${alpha.calendarId}`,
        `payroll/periods/${alpha.periodId}`,
        `payroll/gl-accounts/${alpha.glDebitId}`,
        `payroll/posting-rules/${alpha.ruleId}`,
      ];
      for (const path of targets) {
        const res = await call('patch', alpha.admin, path, {
          tenantId: beta.tenantId,
        });
        expectStatus(res, 400);
      }
    });
  });
});
