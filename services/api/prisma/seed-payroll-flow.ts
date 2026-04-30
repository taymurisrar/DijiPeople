import 'dotenv/config';
import {
  AttendanceEntrySource,
  AttendanceEntryStatus,
  AttendanceMode,
  BusinessTripApprovalStatus,
  BusinessTripStatus,
  ClaimApprovalStatus,
  ClaimApprovalStep,
  ClaimRequestStatus,
  CompensationPayFrequency,
  EmployeeCompensationHistoryStatus,
  EmployeeEmploymentStatus,
  EmployeeType,
  EmployeeWorkMode,
  LeaveRequestStatus,
  OvertimeCalculationPeriod,
  PayComponentCalculationMethod,
  PayComponentType,
  PayrollCalendarFrequency,
  PayrollGlAccountType,
  PayrollJournalEntryStatus,
  PayrollPeriodStatus,
  PayrollRunLineItemCategory,
  PayrollRunStatus,
  Prisma,
  PrismaClient,
  TaxCalculationMethod,
  TaxType,
  TimePayrollMode,
  TimeProrationBasis,
  TravelAllowanceCalculationBasis,
  TravelAllowanceType,
  WorkWeekday,
} from '@prisma/client';
import type { AuthenticatedUser } from '../src/common/interfaces/authenticated-request.interface';
import { CompensationResolverService } from '../src/modules/compensation/compensation-resolver.service';
import { PayrollJournalService } from '../src/modules/payroll/payroll-journal.service';
import { PayrollPostingRuleResolverService } from '../src/modules/payroll/payroll-posting-rule-resolver.service';
import { PayrollRunService } from '../src/modules/payroll/payroll-run.service';
import { PayslipsService } from '../src/modules/payslips/payslips.service';
import { TaxCalculationService } from '../src/modules/tax-rules/tax-calculation.service';
import { TaxRuleResolverService } from '../src/modules/tax-rules/tax-rule-resolver.service';
import { OvertimePolicyResolverService } from '../src/modules/time-payroll/overtime-policy-resolver.service';
import { TimePayrollPolicyResolverService } from '../src/modules/time-payroll/time-payroll-policy-resolver.service';
import { TimePayrollPreparationService } from '../src/modules/time-payroll/time-payroll-preparation.service';

const prisma = new PrismaClient();
const money = (value: string | number) => new Prisma.Decimal(value);
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const at = (value: string, hour: number) =>
  new Date(`${value}T${String(hour).padStart(2, '0')}:00:00.000Z`);

async function main() {
  const tenant = await findTenant();
  const actor = await findActorUser(tenant.id);
  const user = buildSystemUser(tenant.id, actor);

  const setup = await seedTenantSetup(tenant.id, actor.id);
  const run = await resetValidationRun(tenant.id, actor.id, setup);

  const services = buildServices();
  await services.payrollRun.calculateDraftPayrollRun(user, run.id);
  const payslipResult = await services.payslips.generatePayslipsForRun({
    tenantId: tenant.id,
    payrollRunId: run.id,
    actorUserId: actor.id,
  });
  const journal = await services.journal.generateJournalForPayrollRun({
    tenantId: tenant.id,
    payrollRunId: run.id,
    userId: actor.id,
  });
  const csv = await services.journal.exportJournalCsv(user, run.id);

  const summary = await buildFlowSummary(tenant.id, run.id, csv);
  console.log(
    JSON.stringify(
      {
        tenant: tenant.slug,
        payrollRunId: run.id,
        payslipsGenerated: payslipResult.generatedCount,
        payslipsSkipped: payslipResult.skippedCount,
        journalId: journal.id,
        journalStatus: journal.status,
        ...summary,
      },
      null,
      2,
    ),
  );
}

async function findTenant() {
  const slug = process.env.BOOTSTRAP_TENANT_SLUG ?? 'dijipeople-demo';
  const tenant =
    (await prisma.tenant.findUnique({ where: { slug } })) ??
    (await prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } }));
  if (!tenant) {
    throw new Error(
      'No tenant exists. Run npm run seed:admin or create a tenant before running seed:payroll-flow.',
    );
  }
  return tenant;
}

async function findActorUser(tenantId: string) {
  const user = await prisma.user.findFirst({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
  });
  if (!user) {
    throw new Error(
      'No tenant user exists. Run npm run seed:admin before running seed:payroll-flow.',
    );
  }
  return user;
}

function buildSystemUser(
  tenantId: string,
  actor: { id: string; email: string; firstName: string; lastName: string },
): AuthenticatedUser {
  return {
    userId: actor.id,
    tenantId,
    email: actor.email,
    firstName: actor.firstName,
    lastName: actor.lastName,
    roleIds: [],
    roleKeys: ['system-admin'],
    permissionKeys: ['*'],
    accessContext: {
      isSystemAdministrator: true,
      isSystemCustomizer: true,
      isTenantOwner: true,
      businessUnitId: '',
      organizationId: '',
      teamIds: [],
      accessibleBusinessUnitIds: [],
      businessUnitSubtreeIds: [],
      canAccessAllBusinessUnits: true,
    },
  };
}

function buildServices() {
  const audit = { log: async () => undefined };
  const compensationResolver = new CompensationResolverService(prisma as never);
  const timePolicyResolver = new TimePayrollPolicyResolverService(
    prisma as never,
  );
  const overtimePolicyResolver = new OvertimePolicyResolverService(
    prisma as never,
  );
  const timePayrollPreparation = new TimePayrollPreparationService(
    prisma as never,
    audit as never,
    timePolicyResolver,
    overtimePolicyResolver,
  );
  const taxRuleResolver = new TaxRuleResolverService(prisma as never);
  const taxCalculation = new TaxCalculationService(
    prisma as never,
    taxRuleResolver,
    audit as never,
  );
  const payrollRun = new PayrollRunService(
    prisma as never,
    audit as never,
    compensationResolver,
    timePayrollPreparation,
    taxCalculation,
  );
  const payslips = new PayslipsService(prisma as never, audit as never);
  const postingRuleResolver = new PayrollPostingRuleResolverService(
    prisma as never,
  );
  const journal = new PayrollJournalService(
    prisma as never,
    audit as never,
    postingRuleResolver,
  );
  return { payrollRun, payslips, journal };
}

async function seedTenantSetup(tenantId: string, actorUserId: string) {
  const organization = await prisma.organization.upsert({
    where: { tenantId_name: { tenantId, name: 'DijiPeople Demo Company' } },
    update: {},
    create: { tenantId, name: 'DijiPeople Demo Company' },
  });
  const businessUnit = await upsertBusinessUnit({
    tenantId,
    organizationId: organization.id,
    name: 'Payroll Validation Unit',
  });
  const department = await prisma.department.upsert({
    where: { tenantId_code: { tenantId, code: 'PAYROLL-OPS' } },
    update: { isActive: true },
    create: {
      tenantId,
      code: 'PAYROLL-OPS',
      name: 'Payroll Operations',
      description: 'Seeded payroll validation department.',
    },
  });
  const designation = await prisma.designation.upsert({
    where: { tenantId_name: { tenantId, name: 'Payroll Analyst' } },
    update: { isActive: true },
    create: {
      tenantId,
      name: 'Payroll Analyst',
      level: 'L2',
      description: 'Seeded payroll validation designation.',
    },
  });
  const location = await prisma.location.upsert({
    where: { tenantId_code: { tenantId, code: 'DOH-HQ' } },
    update: { isActive: true },
    create: {
      tenantId,
      code: 'DOH-HQ',
      name: 'Doha HQ',
      addressLine1: 'West Bay',
      city: 'Doha',
      state: 'Doha',
      country: 'QA',
      timezone: 'Asia/Qatar',
    },
  });

  const levels = await seedEmployeeLevels(tenantId);
  const employees = await seedEmployees({
    tenantId,
    actorUserId,
    businessUnitId: businessUnit.id,
    departmentId: department.id,
    designationId: designation.id,
    locationId: location.id,
    levels,
  });
  const payComponents = await seedPayComponents(tenantId);
  await seedCompensation(tenantId, actorUserId, employees, payComponents);
  const leaveTypes = await seedLeave(tenantId, actorUserId, employees);
  await seedClaims(tenantId, actorUserId, employees[0]);
  await seedTada(tenantId, actorUserId, employees[0], levels.L2);
  await seedTime(tenantId, actorUserId, businessUnit.id, employees, location.id);
  const taxRules = await seedTaxRules(tenantId, payComponents, levels.L2);
  const glAccounts = await seedGlAccounts(tenantId);
  await seedPostingRules(tenantId, glAccounts);
  const calendar = await seedPayrollCalendar(tenantId, businessUnit.id);
  const period = await seedPayrollPeriod(tenantId, calendar.id);

  return {
    tenantId,
    actorUserId,
    businessUnit,
    employees,
    payComponents,
    leaveTypes,
    taxRules,
    glAccounts,
    calendar,
    period,
  };
}

async function upsertBusinessUnit(input: {
  tenantId: string;
  organizationId: string;
  name: string;
}) {
  const existing = await prisma.businessUnit.findFirst({
    where: {
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      name: input.name,
    },
  });
  if (existing) return existing;
  return prisma.businessUnit.create({
    data: {
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      name: input.name,
      payrollContactName: 'Payroll Operations',
      payrollContactEmail: 'payroll.ops@example.com',
    },
  });
}

async function seedEmployeeLevels(tenantId: string) {
  const entries = [
    ['L1', 'Associate', 1],
    ['L2', 'Specialist', 2],
    ['L3', 'Senior Specialist', 3],
    ['L4', 'Manager', 4],
  ] as const;
  const result: Record<string, Awaited<ReturnType<typeof prisma.employeeLevel.upsert>>> =
    {};
  for (const [code, name, rank] of entries) {
    result[code] = await prisma.employeeLevel.upsert({
      where: { tenantId_code: { tenantId, code } },
      update: { name, rank, isActive: true },
      create: {
        tenantId,
        code,
        name,
        rank,
        description: `${name} payroll and policy assignment level.`,
      },
    });
  }
  return result;
}

async function seedEmployees(input: {
  tenantId: string;
  actorUserId: string;
  businessUnitId: string;
  departmentId: string;
  designationId: string;
  locationId: string;
  levels: Record<string, { id: string }>;
}) {
  const rows = [
    {
      code: 'DP-PAY-001',
      firstName: 'Aisha',
      lastName: 'Rahman',
      email: 'aisha.payroll.validation@example.com',
      phone: '+97455501001',
      levelId: input.levels.L2.id,
      base: '12000',
      housing: '2500',
      transport: '800',
    },
    {
      code: 'DP-PAY-002',
      firstName: 'Omar',
      lastName: 'Haddad',
      email: 'omar.payroll.validation@example.com',
      phone: '+97455501002',
      levelId: input.levels.L1.id,
      base: '9500',
      housing: '1800',
      transport: '650',
    },
    {
      code: 'DP-PAY-003',
      firstName: 'Maya',
      lastName: 'Santos',
      email: 'maya.payroll.validation@example.com',
      phone: '+97455501003',
      levelId: input.levels.L3.id,
      base: '15000',
      housing: '3200',
      transport: '1000',
    },
  ];

  const employees: Array<
    Awaited<ReturnType<typeof prisma.employee.upsert>> & {
      compensationSeed: (typeof rows)[number];
    }
  > = [];
  for (const row of rows) {
    const employee = await prisma.employee.upsert({
      where: {
        tenantId_employeeCode: {
          tenantId: input.tenantId,
          employeeCode: row.code,
        },
      },
      update: {
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        businessUnitId: input.businessUnitId,
        departmentId: input.departmentId,
        designationId: input.designationId,
        employeeLevelId: row.levelId,
        locationId: input.locationId,
        officialJoiningLocationId: input.locationId,
        employmentStatus: EmployeeEmploymentStatus.ACTIVE,
        isDraftProfile: false,
      },
      create: {
        tenantId: input.tenantId,
        employeeCode: row.code,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        hireDate: date('2025-01-01'),
        businessUnitId: input.businessUnitId,
        departmentId: input.departmentId,
        designationId: input.designationId,
        employeeLevelId: row.levelId,
        locationId: input.locationId,
        officialJoiningLocationId: input.locationId,
        employmentStatus: EmployeeEmploymentStatus.ACTIVE,
        employeeType: EmployeeType.FULL_TIME,
        workMode: EmployeeWorkMode.HYBRID,
        city: 'Doha',
        country: 'QA',
        createdById: input.actorUserId,
      },
    });
    employees.push({ ...employee, compensationSeed: row });
  }
  return employees;
}

async function seedPayComponents(tenantId: string) {
  const rows = [
    {
      code: 'BASIC_SALARY',
      name: 'Basic Salary',
      componentType: PayComponentType.EARNING,
      calculationMethod: PayComponentCalculationMethod.FIXED,
      isTaxable: true,
      affectsGrossPay: true,
      affectsNetPay: true,
      isRecurring: true,
      displayOrder: 10,
    },
    {
      code: 'HOUSING_ALLOWANCE',
      name: 'Housing Allowance',
      componentType: PayComponentType.ALLOWANCE,
      calculationMethod: PayComponentCalculationMethod.FIXED,
      isTaxable: true,
      affectsGrossPay: true,
      affectsNetPay: true,
      isRecurring: true,
      displayOrder: 20,
    },
    {
      code: 'TRANSPORT_ALLOWANCE',
      name: 'Transport Allowance',
      componentType: PayComponentType.ALLOWANCE,
      calculationMethod: PayComponentCalculationMethod.FIXED,
      isTaxable: false,
      affectsGrossPay: true,
      affectsNetPay: true,
      isRecurring: true,
      displayOrder: 30,
    },
    {
      code: 'OVERTIME',
      name: 'Overtime',
      componentType: PayComponentType.EARNING,
      calculationMethod: PayComponentCalculationMethod.SYSTEM_CALCULATED,
      isTaxable: true,
      affectsGrossPay: true,
      affectsNetPay: true,
      displayOrder: 60,
    },
    {
      code: 'UNPAID_LEAVE_DEDUCTION',
      name: 'Unpaid Leave Deduction',
      componentType: PayComponentType.DEDUCTION,
      calculationMethod: PayComponentCalculationMethod.SYSTEM_CALCULATED,
      isTaxable: false,
      affectsGrossPay: false,
      affectsNetPay: true,
      displayOrder: 90,
    },
    {
      code: 'MANUAL_REIMBURSEMENT',
      name: 'Manual Reimbursement',
      componentType: PayComponentType.REIMBURSEMENT,
      calculationMethod: PayComponentCalculationMethod.MANUAL,
      isTaxable: false,
      affectsGrossPay: false,
      affectsNetPay: true,
      displayOrder: 70,
    },
  ];

  const result: Record<string, Awaited<ReturnType<typeof prisma.payComponent.upsert>>> =
    {};
  for (const row of rows) {
    result[row.code] = await prisma.payComponent.upsert({
      where: { tenantId_code: { tenantId, code: row.code } },
      update: { ...row, isActive: true },
      create: { tenantId, ...row, description: `Seeded ${row.name}.` },
    });
  }
  return result;
}

async function seedCompensation(
  tenantId: string,
  actorUserId: string,
  employees: Array<{
    id: string;
    compensationSeed: { base: string; housing: string; transport: string };
  }>,
  payComponents: Record<string, { id: string; calculationMethod: PayComponentCalculationMethod }>,
) {
  for (const employee of employees) {
    await prisma.employeeCompensationHistory.updateMany({
      where: {
        tenantId,
        employeeId: employee.id,
        status: EmployeeCompensationHistoryStatus.ACTIVE,
      },
      data: { status: EmployeeCompensationHistoryStatus.RETIRED, effectiveTo: date('2026-03-31') },
    });
    const existing = await prisma.employeeCompensationHistory.findFirst({
      where: {
        tenantId,
        employeeId: employee.id,
        effectiveFrom: date('2026-04-01'),
      },
    });
    const history =
      existing ??
      (await prisma.employeeCompensationHistory.create({
        data: {
          tenantId,
          employeeId: employee.id,
          effectiveFrom: date('2026-04-01'),
          payFrequency: CompensationPayFrequency.MONTHLY,
          currencyCode: 'QAR',
          baseAmount: money(employee.compensationSeed.base),
          status: EmployeeCompensationHistoryStatus.ACTIVE,
          notes: 'Seeded for full payroll validation flow.',
          createdBy: actorUserId,
        },
      }));
    await prisma.employeeCompensationHistory.update({
      where: { id: history.id },
      data: {
        effectiveTo: null,
        payFrequency: CompensationPayFrequency.MONTHLY,
        currencyCode: 'QAR',
        baseAmount: money(employee.compensationSeed.base),
        status: EmployeeCompensationHistoryStatus.ACTIVE,
      },
    });

    const componentRows = [
      ['BASIC_SALARY', employee.compensationSeed.base, 10],
      ['HOUSING_ALLOWANCE', employee.compensationSeed.housing, 20],
      ['TRANSPORT_ALLOWANCE', employee.compensationSeed.transport, 30],
    ] as const;
    for (const [code, amount, displayOrder] of componentRows) {
      await prisma.employeeCompensationComponent.upsert({
        where: {
          compensationHistoryId_payComponentId: {
            compensationHistoryId: history.id,
            payComponentId: payComponents[code].id,
          },
        },
        update: {
          amount: money(amount),
          percentage: null,
          calculationMethodSnapshot: payComponents[code].calculationMethod,
          isRecurring: true,
          displayOrder,
        },
        create: {
          tenantId,
          compensationHistoryId: history.id,
          payComponentId: payComponents[code].id,
          amount: money(amount),
          calculationMethodSnapshot: payComponents[code].calculationMethod,
          isRecurring: true,
          displayOrder,
        },
      });
    }
  }
}

async function seedLeave(
  tenantId: string,
  actorUserId: string,
  employees: Array<{ id: string }>,
) {
  const leaveTypes = {
    annual: await upsertLeaveType(tenantId, 'ANNUAL', 'Annual Leave', true),
    sick: await upsertLeaveType(tenantId, 'SICK', 'Sick Leave', true),
    unpaid: await upsertLeaveType(tenantId, 'UNPAID', 'Unpaid Leave', false),
  };

  for (const employee of employees) {
    await prisma.leaveBalance.upsert({
      where: {
        tenantId_employeeId_leaveTypeId: {
          tenantId,
          employeeId: employee.id,
          leaveTypeId: leaveTypes.annual.id,
        },
      },
      update: {
        totalAllocated: money(21),
        totalUsed: money(0),
        totalRemaining: money(21),
        lastUpdatedAt: new Date(),
      },
      create: {
        tenantId,
        employeeId: employee.id,
        leaveTypeId: leaveTypes.annual.id,
        totalAllocated: money(21),
        totalRemaining: money(21),
      },
    });
  }

  const primary = employees[0];
  const leaveRequest = await upsertLeaveRequest({
    tenantId,
    employeeId: primary.id,
    leaveTypeId: leaveTypes.unpaid.id,
    startDate: date('2026-04-03'),
    endDate: date('2026-04-03'),
    totalDays: money(1),
    reason: 'Seeded unpaid leave for payroll deduction validation.',
    actorUserId,
  });
  await prisma.leaveConsumptionRecord.upsert({
    where: { tenantId_leaveRequestId: { tenantId, leaveRequestId: leaveRequest.id } },
    update: { days: money(1), isPaid: false },
    create: {
      tenantId,
      employeeId: primary.id,
      leaveRequestId: leaveRequest.id,
      leaveTypeId: leaveTypes.unpaid.id,
      days: money(1),
      isPaid: false,
    },
  });
  await prisma.leaveBalance.upsert({
    where: {
      tenantId_employeeId_leaveTypeId: {
        tenantId,
        employeeId: primary.id,
        leaveTypeId: leaveTypes.unpaid.id,
      },
    },
    update: {
      totalAllocated: money(0),
      totalUsed: money(1),
      totalRemaining: money(-1),
      lastUpdatedAt: new Date(),
    },
    create: {
      tenantId,
      employeeId: primary.id,
      leaveTypeId: leaveTypes.unpaid.id,
      totalAllocated: money(0),
      totalUsed: money(1),
      totalRemaining: money(-1),
    },
  });

  return leaveTypes;
}

async function upsertLeaveType(
  tenantId: string,
  code: string,
  name: string,
  isPaid: boolean,
) {
  return prisma.leaveType.upsert({
    where: { tenantId_code: { tenantId, code } },
    update: { name, category: isPaid ? 'PAID' : 'UNPAID', isPaid, isActive: true },
    create: {
      tenantId,
      code,
      name,
      category: isPaid ? 'PAID' : 'UNPAID',
      isPaid,
      requiresApproval: true,
    },
  });
}

async function upsertLeaveRequest(input: {
  tenantId: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  totalDays: Prisma.Decimal;
  reason: string;
  actorUserId: string;
}) {
  const existing = await prisma.leaveRequest.findFirst({
    where: {
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      leaveTypeId: input.leaveTypeId,
      startDate: input.startDate,
      endDate: input.endDate,
    },
  });
  const data = {
    totalDays: input.totalDays,
    reason: input.reason,
    status: LeaveRequestStatus.APPROVED,
    updatedById: input.actorUserId,
  };
  if (existing) {
    return prisma.leaveRequest.update({ where: { id: existing.id }, data });
  }
  return prisma.leaveRequest.create({
    data: {
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      leaveTypeId: input.leaveTypeId,
      startDate: input.startDate,
      endDate: input.endDate,
      ...data,
      createdById: input.actorUserId,
    },
  });
}

async function seedClaims(
  tenantId: string,
  actorUserId: string,
  employee: { id: string },
) {
  const claimType = await prisma.claimType.upsert({
    where: { tenantId_code: { tenantId, code: 'TRAVEL_EXPENSE' } },
    update: { name: 'Travel Expense', isActive: true },
    create: {
      tenantId,
      code: 'TRAVEL_EXPENSE',
      name: 'Travel Expense',
      description: 'Business travel related reimbursements.',
    },
  });
  const subType = await prisma.claimSubType.upsert({
    where: {
      claimTypeId_code: {
        claimTypeId: claimType.id,
        code: 'LOCAL_TRANSPORT',
      },
    },
    update: { name: 'Local Transport', requiresReceipt: false, isActive: true },
    create: {
      tenantId,
      claimTypeId: claimType.id,
      code: 'LOCAL_TRANSPORT',
      name: 'Local Transport',
      requiresReceipt: false,
    },
  });

  const claim = await upsertClaimRequest({
    tenantId,
    employeeId: employee.id,
    actorUserId,
    title: 'April client visit transport',
    amount: money(350),
  });
  const existingLine = await prisma.claimLineItem.findFirst({
    where: { tenantId, claimRequestId: claim.id, claimSubTypeId: subType.id },
  });
  if (existingLine) {
    await prisma.claimLineItem.update({
      where: { id: existingLine.id },
      data: {
        amount: money(350),
        approvedAmount: money(350),
        currencyCode: 'QAR',
        payrollRunEmployeeId: null,
        payrollIncludedAt: null,
      },
    });
  } else {
    await prisma.claimLineItem.create({
      data: {
        tenantId,
        employeeId: employee.id,
        claimRequestId: claim.id,
        claimTypeId: claimType.id,
        claimSubTypeId: subType.id,
        transactionDate: date('2026-04-02'),
        vendor: 'Metro and Taxi',
        description: 'Client visit local transport.',
        amount: money(350),
        approvedAmount: money(350),
        currencyCode: 'QAR',
      },
    });
  }
  await prisma.claimRequest.update({
    where: { id: claim.id },
    data: {
      status: ClaimRequestStatus.PAYROLL_APPROVED,
      approvedAmount: money(350),
      includedInPayrollAt: null,
    },
  });
  await ensureClaimApproval(tenantId, claim.id, ClaimApprovalStep.MANAGER, actorUserId);
  await ensureClaimApproval(tenantId, claim.id, ClaimApprovalStep.PAYROLL, actorUserId);
}

async function upsertClaimRequest(input: {
  tenantId: string;
  employeeId: string;
  actorUserId: string;
  title: string;
  amount: Prisma.Decimal;
}) {
  const existing = await prisma.claimRequest.findFirst({
    where: { tenantId: input.tenantId, employeeId: input.employeeId, title: input.title },
  });
  const data = {
    status: ClaimRequestStatus.PAYROLL_APPROVED,
    description: 'Seeded approved claim for payroll reimbursement validation.',
    submittedAmount: input.amount,
    approvedAmount: input.amount,
    currencyCode: 'QAR',
    submittedAt: date('2026-04-02'),
    managerApprovedAt: date('2026-04-02'),
    payrollApprovedAt: date('2026-04-02'),
    rejectedAt: null,
    rejectionReason: null,
    includedInPayrollAt: null,
  };
  if (existing) return prisma.claimRequest.update({ where: { id: existing.id }, data });
  return prisma.claimRequest.create({
    data: {
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      submittedByUserId: input.actorUserId,
      title: input.title,
      ...data,
    },
  });
}

async function ensureClaimApproval(
  tenantId: string,
  claimRequestId: string,
  step: ClaimApprovalStep,
  actorUserId: string,
) {
  const existing = await prisma.claimApproval.findFirst({
    where: { tenantId, claimRequestId, step },
  });
  if (existing) return;
  await prisma.claimApproval.create({
    data: {
      tenantId,
      claimRequestId,
      step,
      status: ClaimApprovalStatus.APPROVED,
      actorUserId,
      comments: 'Seeded approval.',
    },
  });
}

async function seedTada(
  tenantId: string,
  actorUserId: string,
  employee: { id: string },
  employeeLevel: { id: string },
) {
  const policy = await prisma.travelAllowancePolicy.upsert({
    where: { tenantId_code: { tenantId, code: 'DEFAULT_TADA' } },
    update: {
      name: 'Default TA/DA Policy',
      employeeLevelId: null,
      countryCode: null,
      city: null,
      currencyCode: 'QAR',
      isActive: true,
      effectiveFrom: date('2026-01-01'),
      effectiveTo: null,
    },
    create: {
      tenantId,
      code: 'DEFAULT_TADA',
      name: 'Default TA/DA Policy',
      description: 'Tenant default travel allowance policy.',
      currencyCode: 'QAR',
      effectiveFrom: date('2026-01-01'),
    },
  });
  const levelPolicy = await prisma.travelAllowancePolicy.upsert({
    where: { tenantId_code: { tenantId, code: 'L2_DOHA_TADA' } },
    update: {
      name: 'L2 Doha TA/DA Policy',
      employeeLevelId: employeeLevel.id,
      countryCode: 'QA',
      city: 'Doha',
      currencyCode: 'QAR',
      isActive: true,
      effectiveFrom: date('2026-01-01'),
      effectiveTo: null,
    },
    create: {
      tenantId,
      code: 'L2_DOHA_TADA',
      name: 'L2 Doha TA/DA Policy',
      description: 'Level and city-specific policy for resolver validation.',
      employeeLevelId: employeeLevel.id,
      countryCode: 'QA',
      city: 'Doha',
      currencyCode: 'QAR',
      effectiveFrom: date('2026-01-01'),
    },
  });
  await upsertTravelRule(
    tenantId,
    policy.id,
    TravelAllowanceType.DAILY_ALLOWANCE,
    TravelAllowanceCalculationBasis.PER_DAY,
    '150',
  );
  const dailyRule = await upsertTravelRule(
    tenantId,
    levelPolicy.id,
    TravelAllowanceType.DAILY_ALLOWANCE,
    TravelAllowanceCalculationBasis.PER_DAY,
    '220',
  );
  const mealRule = await upsertTravelRule(
    tenantId,
    levelPolicy.id,
    TravelAllowanceType.MEAL_ALLOWANCE,
    TravelAllowanceCalculationBasis.PER_TRIP,
    '120',
  );

  const trip = await upsertBusinessTrip({
    tenantId,
    employeeId: employee.id,
    actorUserId,
    title: 'Doha client implementation visit',
    approvedAllowance: money(560),
  });
  await upsertBusinessTripAllowance({
    tenantId,
    businessTripId: trip.id,
    ruleId: dailyRule.id,
    allowanceType: TravelAllowanceType.DAILY_ALLOWANCE,
    calculationBasis: TravelAllowanceCalculationBasis.PER_DAY,
    quantity: money(2),
    rate: money(220),
    amount: money(440),
  });
  await upsertBusinessTripAllowance({
    tenantId,
    businessTripId: trip.id,
    ruleId: mealRule.id,
    allowanceType: TravelAllowanceType.MEAL_ALLOWANCE,
    calculationBasis: TravelAllowanceCalculationBasis.PER_TRIP,
    quantity: money(1),
    rate: money(120),
    amount: money(120),
  });
  const approval = await prisma.businessTripApproval.findFirst({
    where: { tenantId, businessTripId: trip.id },
  });
  if (!approval) {
    await prisma.businessTripApproval.create({
      data: {
        tenantId,
        businessTripId: trip.id,
        status: BusinessTripApprovalStatus.APPROVED,
        actorUserId,
        comments: 'Seeded approval.',
      },
    });
  }
}

async function upsertTravelRule(
  tenantId: string,
  policyId: string,
  allowanceType: TravelAllowanceType,
  calculationBasis: TravelAllowanceCalculationBasis,
  amount: string,
) {
  const existing = await prisma.travelAllowanceRule.findFirst({
    where: { tenantId, policyId, allowanceType, calculationBasis },
  });
  const data = {
    amount: money(amount),
    currencyCode: 'QAR',
    isActive: true,
  };
  if (existing) return prisma.travelAllowanceRule.update({ where: { id: existing.id }, data });
  return prisma.travelAllowanceRule.create({
    data: {
      tenantId,
      policyId,
      allowanceType,
      calculationBasis,
      ...data,
    },
  });
}

async function upsertBusinessTrip(input: {
  tenantId: string;
  employeeId: string;
  actorUserId: string;
  title: string;
  approvedAllowance: Prisma.Decimal;
}) {
  const existing = await prisma.businessTrip.findFirst({
    where: { tenantId: input.tenantId, employeeId: input.employeeId, title: input.title },
  });
  const data = {
    purpose: 'Seeded trip for TA/DA payroll validation.',
    originCountry: 'QA',
    originCity: 'Doha',
    destinationCountry: 'QA',
    destinationCity: 'Doha',
    startDate: date('2026-04-01'),
    endDate: date('2026-04-02'),
    status: BusinessTripStatus.APPROVED,
    currencyCode: 'QAR',
    estimatedAllowance: input.approvedAllowance,
    approvedAllowance: input.approvedAllowance,
    submittedAt: date('2026-04-01'),
    approvedAt: date('2026-04-01'),
    rejectedAt: null,
    rejectionReason: null,
    includedInPayrollAt: null,
  };
  if (existing) return prisma.businessTrip.update({ where: { id: existing.id }, data });
  return prisma.businessTrip.create({
    data: {
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      requestedByUserId: input.actorUserId,
      title: input.title,
      ...data,
    },
  });
}

async function upsertBusinessTripAllowance(input: {
  tenantId: string;
  businessTripId: string;
  ruleId: string;
  allowanceType: TravelAllowanceType;
  calculationBasis: TravelAllowanceCalculationBasis;
  quantity: Prisma.Decimal;
  rate: Prisma.Decimal;
  amount: Prisma.Decimal;
}) {
  const existing = await prisma.businessTripAllowance.findFirst({
    where: {
      tenantId: input.tenantId,
      businessTripId: input.businessTripId,
      allowanceType: input.allowanceType,
      calculationBasis: input.calculationBasis,
    },
  });
  const data = {
    travelAllowanceRuleId: input.ruleId,
    quantity: input.quantity,
    rate: input.rate,
    amount: input.amount,
    currencyCode: 'QAR',
    payrollRunEmployeeId: null,
    payrollIncludedAt: null,
  };
  if (existing) return prisma.businessTripAllowance.update({ where: { id: existing.id }, data });
  return prisma.businessTripAllowance.create({
    data: {
      tenantId: input.tenantId,
      businessTripId: input.businessTripId,
      allowanceType: input.allowanceType,
      calculationBasis: input.calculationBasis,
      ...data,
    },
  });
}

async function seedTime(
  tenantId: string,
  actorUserId: string,
  businessUnitId: string,
  employees: Array<{ id: string }>,
  locationId: string,
) {
  const schedule = await prisma.workSchedule.upsert({
    where: { tenantId_name: { tenantId, name: 'Payroll Validation Workweek' } },
    update: {
      weeklyWorkDays: [
        WorkWeekday.MONDAY,
        WorkWeekday.TUESDAY,
        WorkWeekday.WEDNESDAY,
        WorkWeekday.THURSDAY,
        WorkWeekday.FRIDAY,
      ],
      standardStartTime: '09:00',
      standardEndTime: '17:00',
      isDefault: true,
      isActive: true,
    },
    create: {
      tenantId,
      name: 'Payroll Validation Workweek',
      weeklyWorkDays: [
        WorkWeekday.MONDAY,
        WorkWeekday.TUESDAY,
        WorkWeekday.WEDNESDAY,
        WorkWeekday.THURSDAY,
        WorkWeekday.FRIDAY,
      ],
      standardStartTime: '09:00',
      standardEndTime: '17:00',
      graceMinutes: 10,
      isDefault: true,
      createdById: actorUserId,
    },
  });
  await prisma.timePayrollPolicy.upsert({
    where: { tenantId_code: { tenantId, code: 'DEFAULT_TIME_PAYROLL' } },
    update: {
      businessUnitId,
      mode: TimePayrollMode.ATTENDANCE_ONLY,
      useAttendanceForPayroll: true,
      useTimesheetForPayroll: false,
      requireAttendanceApproval: false,
      detectNoShow: true,
      deductNoShow: true,
      overtimeEnabled: true,
      standardHoursPerDay: money(8),
      standardWorkingDaysPerMonth: money(22),
      prorationBasis: TimeProrationBasis.WORKING_DAYS,
      isActive: true,
      effectiveFrom: date('2026-01-01'),
      effectiveTo: null,
    },
    create: {
      tenantId,
      code: 'DEFAULT_TIME_PAYROLL',
      name: 'Default Time Payroll Policy',
      description: 'Uses attendance, no-show, and overtime for payroll.',
      businessUnitId,
      mode: TimePayrollMode.ATTENDANCE_ONLY,
      useAttendanceForPayroll: true,
      useTimesheetForPayroll: false,
      requireAttendanceApproval: false,
      requireTimesheetApproval: false,
      detectNoShow: true,
      deductNoShow: true,
      overtimeEnabled: true,
      standardHoursPerDay: money(8),
      standardWorkingDaysPerMonth: money(22),
      prorationBasis: TimeProrationBasis.WORKING_DAYS,
      effectiveFrom: date('2026-01-01'),
    },
  });
  await prisma.overtimePolicy.upsert({
    where: { tenantId_code: { tenantId, code: 'DEFAULT_OVERTIME' } },
    update: {
      businessUnitId,
      calculationPeriod: OvertimeCalculationPeriod.DAILY,
      thresholdHours: money(8),
      rateMultiplier: money('1.5'),
      requiresApproval: false,
      isActive: true,
      effectiveFrom: date('2026-01-01'),
      effectiveTo: null,
    },
    create: {
      tenantId,
      code: 'DEFAULT_OVERTIME',
      name: 'Default Overtime Policy',
      description: 'Daily overtime after 8 hours.',
      businessUnitId,
      calculationPeriod: OvertimeCalculationPeriod.DAILY,
      thresholdHours: money(8),
      rateMultiplier: money('1.5'),
      requiresApproval: false,
      effectiveFrom: date('2026-01-01'),
    },
  });

  await upsertAttendance(tenantId, employees[0].id, schedule.id, locationId, '2026-04-01', 9, 17);
  await upsertAttendance(tenantId, employees[0].id, schedule.id, locationId, '2026-04-02', 9, 19);
  await upsertAttendance(tenantId, employees[1].id, schedule.id, locationId, '2026-04-01', 9, 17);
  await upsertAttendance(tenantId, employees[1].id, schedule.id, locationId, '2026-04-02', 9, 17);
  await upsertAttendance(tenantId, employees[2].id, schedule.id, locationId, '2026-04-01', 9, 17);
  await upsertAttendance(tenantId, employees[2].id, schedule.id, locationId, '2026-04-02', 9, 17);
  await upsertAttendance(tenantId, employees[2].id, schedule.id, locationId, '2026-04-03', 9, 17);
}

async function upsertAttendance(
  tenantId: string,
  employeeId: string,
  workScheduleId: string,
  officeLocationId: string,
  day: string,
  startHour: number,
  endHour: number,
) {
  const existing = await prisma.attendanceEntry.findFirst({
    where: { tenantId, employeeId, date: date(day) },
  });
  const data = {
    workScheduleId,
    officeLocationId,
    checkIn: at(day, startHour),
    checkOut: at(day, endHour),
    attendanceMode: AttendanceMode.OFFICE,
    status: AttendanceEntryStatus.PRESENT,
    source: AttendanceEntrySource.MANUAL,
    notes: 'Seeded attendance for payroll validation.',
  };
  if (existing) return prisma.attendanceEntry.update({ where: { id: existing.id }, data });
  return prisma.attendanceEntry.create({
    data: { tenantId, employeeId, date: date(day), ...data },
  });
}

async function seedTaxRules(
  tenantId: string,
  payComponents: Record<string, { id: string }>,
  employeeLevel: { id: string },
) {
  const incomeTax = await prisma.taxRule.upsert({
    where: { tenantId_code: { tenantId, code: 'GENERIC_INCOME_TAX' } },
    update: {
      name: 'Generic Income Tax',
      calculationMethod: TaxCalculationMethod.PERCENTAGE,
      taxType: TaxType.INCOME_TAX,
      employeeRate: money(5),
      employerRate: money(0),
      isActive: true,
      effectiveFrom: date('2026-01-01'),
      effectiveTo: null,
    },
    create: {
      tenantId,
      code: 'GENERIC_INCOME_TAX',
      name: 'Generic Income Tax',
      description: 'Generic demo percentage tax rule, not country-specific.',
      calculationMethod: TaxCalculationMethod.PERCENTAGE,
      taxType: TaxType.INCOME_TAX,
      employeeRate: money(5),
      employerRate: money(0),
      currencyCode: 'QAR',
      effectiveFrom: date('2026-01-01'),
    },
  });
  const social = await prisma.taxRule.upsert({
    where: { tenantId_code: { tenantId, code: 'GENERIC_SOCIAL_SECURITY' } },
    update: {
      name: 'Generic Social Security',
      calculationMethod: TaxCalculationMethod.PERCENTAGE,
      taxType: TaxType.SOCIAL_SECURITY,
      employeeRate: money(2),
      employerRate: money(3),
      employeeLevelId: null,
      isActive: true,
      effectiveFrom: date('2026-01-01'),
      effectiveTo: null,
    },
    create: {
      tenantId,
      code: 'GENERIC_SOCIAL_SECURITY',
      name: 'Generic Social Security',
      description: 'Generic demo employee/employer contribution rule.',
      calculationMethod: TaxCalculationMethod.PERCENTAGE,
      taxType: TaxType.SOCIAL_SECURITY,
      employeeRate: money(2),
      employerRate: money(3),
      currencyCode: 'QAR',
      effectiveFrom: date('2026-01-01'),
    },
  });
  const bracket = await prisma.taxRule.upsert({
    where: { tenantId_code: { tenantId, code: 'GENERIC_L2_BRACKET_TAX' } },
    update: {
      name: 'Generic L2 Bracket Tax',
      calculationMethod: TaxCalculationMethod.BRACKET,
      taxType: TaxType.OTHER,
      employeeLevelId: employeeLevel.id,
      isActive: true,
      effectiveFrom: date('2026-01-01'),
      effectiveTo: null,
    },
    create: {
      tenantId,
      code: 'GENERIC_L2_BRACKET_TAX',
      name: 'Generic L2 Bracket Tax',
      description: 'Generic employee-level bracket rule for resolver validation.',
      employeeLevelId: employeeLevel.id,
      calculationMethod: TaxCalculationMethod.BRACKET,
      taxType: TaxType.OTHER,
      currencyCode: 'QAR',
      effectiveFrom: date('2026-01-01'),
    },
  });

  await mapTaxComponents(tenantId, incomeTax.id, [
    payComponents.BASIC_SALARY.id,
    payComponents.HOUSING_ALLOWANCE.id,
  ]);
  await mapTaxComponents(tenantId, social.id, [payComponents.BASIC_SALARY.id]);
  await mapTaxComponents(tenantId, bracket.id, [payComponents.BASIC_SALARY.id]);
  await upsertBracket(tenantId, bracket.id, '0', '12000', '1', '0');
  await upsertBracket(tenantId, bracket.id, '12000.01', null, '1.5', '0');
  return { incomeTax, social, bracket };
}

async function mapTaxComponents(
  tenantId: string,
  taxRuleId: string,
  payComponentIds: string[],
) {
  for (const payComponentId of payComponentIds) {
    await prisma.taxRulePayComponent.upsert({
      where: { taxRuleId_payComponentId: { taxRuleId, payComponentId } },
      update: {},
      create: { tenantId, taxRuleId, payComponentId },
    });
  }
}

async function upsertBracket(
  tenantId: string,
  taxRuleId: string,
  minAmount: string,
  maxAmount: string | null,
  employeeRate: string,
  employerRate: string,
) {
  const existing = await prisma.taxRuleBracket.findFirst({
    where: { tenantId, taxRuleId, minAmount: money(minAmount) },
  });
  const data = {
    maxAmount: maxAmount ? money(maxAmount) : null,
    employeeRate: money(employeeRate),
    employerRate: money(employerRate),
    fixedEmployeeAmount: money(0),
    fixedEmployerAmount: money(0),
  };
  if (existing) return prisma.taxRuleBracket.update({ where: { id: existing.id }, data });
  return prisma.taxRuleBracket.create({
    data: { tenantId, taxRuleId, minAmount: money(minAmount), ...data },
  });
}

async function seedGlAccounts(tenantId: string) {
  const rows = [
    ['5000_PAYROLL_EXPENSE', 'Payroll Expense', PayrollGlAccountType.EXPENSE],
    ['5100_EMPLOYER_TAX_EXPENSE', 'Employer Tax Expense', PayrollGlAccountType.EXPENSE],
    ['2100_PAYROLL_PAYABLE', 'Payroll Payable', PayrollGlAccountType.LIABILITY],
    ['2200_DEDUCTION_PAYABLE', 'Deduction Payable', PayrollGlAccountType.LIABILITY],
    ['2300_TAX_PAYABLE', 'Tax Payable', PayrollGlAccountType.LIABILITY],
    ['2400_EMPLOYER_TAX_PAYABLE', 'Employer Tax Payable', PayrollGlAccountType.LIABILITY],
  ] as const;
  const result: Record<string, Awaited<ReturnType<typeof prisma.payrollGlAccount.upsert>>> =
    {};
  for (const [code, name, accountType] of rows) {
    result[code] = await prisma.payrollGlAccount.upsert({
      where: { tenantId_code: { tenantId, code } },
      update: { name, accountType, isActive: true },
      create: {
        tenantId,
        code,
        name,
        accountType,
        description: 'Seeded payroll GL account.',
      },
    });
  }
  return result;
}

async function seedPostingRules(
  tenantId: string,
  accounts: Record<string, { id: string }>,
) {
  const rows = [
    [
      'Earnings to Payroll Payable',
      PayrollRunLineItemCategory.EARNING,
      accounts[PayrollAccount.PayrollExpense].id,
      accounts[PayrollAccount.PayrollPayable].id,
    ],
    [
      'Allowances to Payroll Payable',
      PayrollRunLineItemCategory.ALLOWANCE,
      accounts[PayrollAccount.PayrollExpense].id,
      accounts[PayrollAccount.PayrollPayable].id,
    ],
    [
      'Reimbursements to Payroll Payable',
      PayrollRunLineItemCategory.REIMBURSEMENT,
      accounts[PayrollAccount.PayrollExpense].id,
      accounts[PayrollAccount.PayrollPayable].id,
    ],
    [
      'Deductions to Liability',
      PayrollRunLineItemCategory.DEDUCTION,
      accounts[PayrollAccount.PayrollPayable].id,
      accounts[PayrollAccount.DeductionPayable].id,
    ],
    [
      'Taxes to Tax Payable',
      PayrollRunLineItemCategory.TAX,
      accounts[PayrollAccount.PayrollPayable].id,
      accounts[PayrollAccount.TaxPayable].id,
    ],
    [
      'Employer Contributions to Liability',
      PayrollRunLineItemCategory.EMPLOYER_CONTRIBUTION,
      accounts[PayrollAccount.EmployerTaxExpense].id,
      accounts[PayrollAccount.EmployerTaxPayable].id,
    ],
  ] as const;

  for (const [name, sourceCategory, debitAccountId, creditAccountId] of rows) {
    const existing = await prisma.payrollPostingRule.findFirst({
      where: { tenantId, name, sourceCategory, payComponentId: null, taxRuleId: null },
    });
    const data = {
      description: 'Seeded category default posting rule.',
      sourceCategory,
      payComponentId: null,
      taxRuleId: null,
      debitAccountId,
      creditAccountId,
      isActive: true,
      effectiveFrom: date('2026-01-01'),
      effectiveTo: null,
    };
    if (existing) {
      await prisma.payrollPostingRule.update({ where: { id: existing.id }, data });
    } else {
      await prisma.payrollPostingRule.create({ data: { tenantId, name, ...data } });
    }
  }
}

enum PayrollAccount {
  PayrollExpense = '5000_PAYROLL_EXPENSE',
  EmployerTaxExpense = '5100_EMPLOYER_TAX_EXPENSE',
  PayrollPayable = '2100_PAYROLL_PAYABLE',
  DeductionPayable = '2200_DEDUCTION_PAYABLE',
  TaxPayable = '2300_TAX_PAYABLE',
  EmployerTaxPayable = '2400_EMPLOYER_TAX_PAYABLE',
}

async function seedPayrollCalendar(tenantId: string, businessUnitId: string) {
  const existing = await prisma.payrollCalendar.findFirst({
    where: { tenantId, businessUnitId, name: 'Payroll Validation Monthly Calendar' },
  });
  const data = {
    frequency: PayrollCalendarFrequency.MONTHLY,
    timezone: 'Asia/Qatar',
    currencyCode: 'QAR',
    isDefault: true,
    isActive: true,
  };
  if (existing) return prisma.payrollCalendar.update({ where: { id: existing.id }, data });
  return prisma.payrollCalendar.create({
    data: {
      tenantId,
      businessUnitId,
      name: 'Payroll Validation Monthly Calendar',
      ...data,
    },
  });
}

async function seedPayrollPeriod(tenantId: string, payrollCalendarId: string) {
  return prisma.payrollPeriod.upsert({
    where: {
      payrollCalendarId_periodStart_periodEnd: {
        payrollCalendarId,
        periodStart: date('2026-04-01'),
        periodEnd: date('2026-04-03'),
      },
    },
    update: {
      name: 'April 2026 Payroll Validation',
      cutoffDate: date('2026-04-03'),
      paymentDate: date('2026-04-30'),
      status: PayrollPeriodStatus.OPEN,
    },
    create: {
      tenantId,
      payrollCalendarId,
      name: 'April 2026 Payroll Validation',
      periodStart: date('2026-04-01'),
      periodEnd: date('2026-04-03'),
      cutoffDate: date('2026-04-03'),
      paymentDate: date('2026-04-30'),
      status: PayrollPeriodStatus.OPEN,
    },
  });
}

async function resetValidationRun(
  tenantId: string,
  actorUserId: string,
  setup: Awaited<ReturnType<typeof seedTenantSetup>>,
) {
  const run = await prisma.payrollRun.upsert({
    where: {
      payrollPeriodId_runNumber: {
        payrollPeriodId: setup.period.id,
        runNumber: 99,
      },
    },
    update: {
      status: PayrollRunStatus.DRAFT,
      calculationStartedAt: null,
      calculatedAt: null,
      approvedAt: null,
      paidAt: null,
      lockedAt: null,
      checksum: null,
      inputChangedAfterCalculation: false,
      requiresRecalculation: false,
      notes: 'Seeded validation run. Safe to regenerate.',
    },
    create: {
      tenantId,
      payrollPeriodId: setup.period.id,
      runNumber: 99,
      status: PayrollRunStatus.DRAFT,
      createdBy: actorUserId,
      notes: 'Seeded validation run. Safe to regenerate.',
    },
  });

  await resetGeneratedArtifacts(tenantId, run.id);
  await resetPayrollSources(tenantId);
  return run;
}

async function resetGeneratedArtifacts(tenantId: string, payrollRunId: string) {
  const existingJournal = await prisma.payrollJournalEntry.findUnique({
    where: { tenantId_payrollRunId: { tenantId, payrollRunId } },
  });
  if (existingJournal?.status === PayrollJournalEntryStatus.EXPORTED) {
    await prisma.payrollJournalEntry.update({
      where: { id: existingJournal.id },
      data: { status: PayrollJournalEntryStatus.GENERATED, exportedAt: null },
    });
  }
  await prisma.payrollJournalEntry.deleteMany({ where: { tenantId, payrollRunId } });
  await prisma.payslip.deleteMany({ where: { tenantId, payrollRunId } });
  await prisma.payrollRunEmployee.deleteMany({ where: { tenantId, payrollRunId } });
  await prisma.payrollException.deleteMany({ where: { tenantId, payrollRunId } });
}

async function resetPayrollSources(tenantId: string) {
  await prisma.claimLineItem.updateMany({
    where: { tenantId, claimRequest: { title: 'April client visit transport' } },
    data: { payrollRunEmployeeId: null, payrollIncludedAt: null },
  });
  await prisma.claimRequest.updateMany({
    where: { tenantId, title: 'April client visit transport' },
    data: {
      status: ClaimRequestStatus.PAYROLL_APPROVED,
      includedInPayrollAt: null,
      paidAt: null,
    },
  });
  await prisma.businessTripAllowance.updateMany({
    where: { tenantId, businessTrip: { title: 'Doha client implementation visit' } },
    data: { payrollRunEmployeeId: null, payrollIncludedAt: null },
  });
  await prisma.businessTrip.updateMany({
    where: { tenantId, title: 'Doha client implementation visit' },
    data: { status: BusinessTripStatus.APPROVED, includedInPayrollAt: null },
  });
  await prisma.timePayrollInput.deleteMany({
    where: {
      tenantId,
      employee: { employeeCode: { in: ['DP-PAY-001', 'DP-PAY-002', 'DP-PAY-003'] } },
      workDate: { gte: date('2026-04-01'), lte: date('2026-04-03') },
    },
  });
}

async function buildFlowSummary(
  tenantId: string,
  payrollRunId: string,
  csv: string,
) {
  const employees = await prisma.payrollRunEmployee.findMany({
    where: { tenantId, payrollRunId },
    include: { lineItems: true, inputSnapshots: true, payslip: true },
    orderBy: { createdAt: 'asc' },
  });
  const lineItems = employees.flatMap((employee) => employee.lineItems);
  const snapshots = employees.flatMap((employee) => employee.inputSnapshots);
  const journal = await prisma.payrollJournalEntry.findUnique({
    where: { tenantId_payrollRunId: { tenantId, payrollRunId } },
    include: { lines: true },
  });
  const checks = {
    compensation: snapshots.some((item) => item.sourceType === 'COMPENSATION'),
    leave: lineItems.some((item) => item.sourceType === 'LEAVE'),
    claim: lineItems.some((item) => item.sourceType === 'CLAIM'),
    tada: lineItems.some((item) => item.sourceType === 'TADA'),
    time: snapshots.some((item) =>
      ['ATTENDANCE', 'TIMESHEET', 'MANUAL', 'POLICY'].includes(item.sourceType),
    ),
    overtime: lineItems.some((item) => item.sourceType === 'OVERTIME'),
    noShow: lineItems.some((item) => item.sourceType === 'NO_SHOW'),
    tax: lineItems.some((item) => item.category === PayrollRunLineItemCategory.TAX),
    employerContribution: lineItems.some(
      (item) => item.category === PayrollRunLineItemCategory.EMPLOYER_CONTRIBUTION,
    ),
    payslip: employees.some((employee) => employee.payslip),
    journal: Boolean(journal?.lines.length),
    csv: csv.split('\n').length > 1,
  };
  const failed = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);
  if (failed.length) {
    throw new Error(`Flow validation failed: ${failed.join(', ')}`);
  }
  return {
    runEmployees: employees.length,
    lineItems: lineItems.length,
    snapshots: snapshots.length,
    payslips: employees.filter((employee) => employee.payslip).length,
    journalLines: journal?.lines.length ?? 0,
    csvRows: csv.split('\n').length - 1,
    checks,
  };
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
