import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import {
  EmployeeEmploymentStatus,
  EmployeeRecordType,
  EmployeeType,
  EmployeeWorkMode,
  PayComponentCalculationMethod,
  PayComponentType,
  Prisma,
  PrismaClient,
} from '@prisma/client';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv();

const prisma = new PrismaClient();

function env(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback;
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required to seed demo data.');
  }

  const slug = env('BOOTSTRAP_TENANT_SLUG', 'dijipeople-demo').toLowerCase();
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });

  if (!tenant) {
    throw new Error(
      `Tenant "${slug}" was not found. Run seed:admin before seed:demo.`,
    );
  }

  const organization = await prisma.organization.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'DijiPeople Demo HQ' } },
    update: {},
    create: { tenantId: tenant.id, name: 'DijiPeople Demo HQ' },
  });

  const businessUnit = await prisma.businessUnit.upsert({
    where: {
      tenantId_organizationId_name: {
        tenantId: tenant.id,
        organizationId: organization.id,
        name: 'Head Office',
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      organizationId: organization.id,
      name: 'Head Office',
    },
  });

  const [hrDepartment, engineeringDepartment, financeDepartment] =
    await Promise.all(
      [
        ['HR', 'Human Resources'],
        ['ENG', 'Engineering'],
        ['FIN', 'Finance'],
      ].map(([code, name]) =>
        prisma.department.upsert({
          where: { tenantId_code: { tenantId: tenant.id, code } },
          update: { name },
          create: { tenantId: tenant.id, code, name },
        }),
      ),
    );

  const [managerDesignation, engineerDesignation, financeDesignation] =
    await Promise.all(
      [
        ['Manager', 'L4'],
        ['Software Engineer', 'L2'],
        ['Payroll Specialist', 'L3'],
      ].map(([name, level]) =>
        prisma.designation.upsert({
          where: { tenantId_name: { tenantId: tenant.id, name } },
          update: { level },
          create: { tenantId: tenant.id, name, level },
        }),
      ),
    );

  const location = await prisma.location.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'DOH' } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'DOH',
      name: 'Doha Office',
      city: 'Doha',
      state: 'Doha',
      country: 'Qatar',
      timezone: 'Asia/Qatar',
    },
  });

  const employees = await Promise.all(
    [
      ['DP-1001', 'Ayesha', 'Khan', 'ayesha.demo@dijipeople.local', hrDepartment.id, managerDesignation.id],
      ['DP-1002', 'Omar', 'Farooq', 'omar.demo@dijipeople.local', engineeringDepartment.id, engineerDesignation.id],
      ['DP-1003', 'Sara', 'Ahmed', 'sara.demo@dijipeople.local', financeDepartment.id, financeDesignation.id],
      ['DP-1004', 'Bilal', 'Hassan', 'bilal.demo@dijipeople.local', engineeringDepartment.id, engineerDesignation.id],
      ['DP-1005', 'Mariam', 'Ali', 'mariam.demo@dijipeople.local', hrDepartment.id, engineerDesignation.id],
      ['DP-1006', 'Zain', 'Malik', 'zain.demo@dijipeople.local', financeDepartment.id, financeDesignation.id],
      ['DP-1007', 'Noor', 'Saeed', 'noor.demo@dijipeople.local', engineeringDepartment.id, engineerDesignation.id],
      ['DP-1008', 'Hamza', 'Raza', 'hamza.demo@dijipeople.local', engineeringDepartment.id, engineerDesignation.id],
    ].map(([employeeCode, firstName, lastName, email, departmentId, designationId]) =>
      prisma.employee.upsert({
        where: { tenantId_employeeCode: { tenantId: tenant.id, employeeCode } },
        update: { firstName, lastName, email },
        create: {
          tenantId: tenant.id,
          businessUnitId: businessUnit.id,
          employeeCode,
          recordType: EmployeeRecordType.INTERNAL_EMPLOYEE,
          firstName,
          lastName,
          email,
          phone: '+97400000000',
          hireDate: new Date('2025-01-01T00:00:00.000Z'),
          employmentStatus: EmployeeEmploymentStatus.ACTIVE,
          employeeType: EmployeeType.FULL_TIME,
          workMode: EmployeeWorkMode.HYBRID,
          departmentId,
          designationId,
          locationId: location.id,
        },
      }),
    ),
  );

  await Promise.all(
    [
      ['ANNUAL', 'Annual Leave', true],
      ['SICK', 'Sick Leave', true],
      ['CASUAL', 'Casual Leave', true],
      ['UNPAID', 'Unpaid Leave', false],
    ].map(([code, name, isPaid]) =>
      prisma.leaveType.upsert({
        where: { tenantId_code: { tenantId: tenant.id, code: String(code) } },
        update: { name: String(name), isPaid: Boolean(isPaid) },
        create: {
          tenantId: tenant.id,
          code: String(code),
          name: String(name),
          category: String(code),
          isPaid: Boolean(isPaid),
        },
      }),
    ),
  );

  await Promise.all(
    [
      ['BASIC_SALARY', 'Basic Salary', PayComponentType.EARNING],
      ['HOUSING_ALLOWANCE', 'Housing Allowance', PayComponentType.ALLOWANCE],
      ['TRANSPORT_ALLOWANCE', 'Transport Allowance', PayComponentType.ALLOWANCE],
      ['OVERTIME', 'Overtime', PayComponentType.EARNING],
      ['UNPAID_LEAVE_DEDUCTION', 'Unpaid Leave Deduction', PayComponentType.DEDUCTION],
      ['MANUAL_REIMBURSEMENT', 'Manual Reimbursement', PayComponentType.REIMBURSEMENT],
    ].map(([code, name, componentType], index) =>
      prisma.payComponent.upsert({
        where: { tenantId_code: { tenantId: tenant.id, code: String(code) } },
        update: { name: String(name), componentType: componentType as PayComponentType },
        create: {
          tenantId: tenant.id,
          code: String(code),
          name: String(name),
          componentType: componentType as PayComponentType,
          calculationMethod: PayComponentCalculationMethod.FIXED,
          displayOrder: index,
          isRecurring: index < 3,
        },
      }),
    ),
  );

  const basicSalary = await prisma.payComponent.findFirstOrThrow({
    where: { tenantId: tenant.id, code: 'BASIC_SALARY' },
  });

  for (const [index, employee] of employees.entries()) {
    const compensation = await prisma.employeeCompensationHistory.upsert({
      where: {
        id:
          (
            await prisma.employeeCompensationHistory.findFirst({
              where: { tenantId: tenant.id, employeeId: employee.id },
              select: { id: true },
            })
          )?.id ?? `demo-${employee.id}`,
      },
      update: {},
      create: {
        tenantId: tenant.id,
        employeeId: employee.id,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        payFrequency: 'MONTHLY',
        currencyCode: 'QAR',
        baseAmount: new Prisma.Decimal(9000 + index * 750),
        status: 'ACTIVE',
      },
    });

    await prisma.employeeCompensationComponent.upsert({
      where: {
        id:
          (
            await prisma.employeeCompensationComponent.findFirst({
              where: {
                tenantId: tenant.id,
                compensationHistoryId: compensation.id,
                payComponentId: basicSalary.id,
              },
              select: { id: true },
            })
          )?.id ?? `demo-${compensation.id}`,
      },
      update: {},
      create: {
        tenantId: tenant.id,
        compensationHistoryId: compensation.id,
        payComponentId: basicSalary.id,
        amount: compensation.baseAmount,
        calculationMethodSnapshot: 'FIXED',
        isRecurring: true,
      },
    });
  }

  const project = await prisma.project.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'HRM-OPS' } },
    update: {},
    create: {
      tenantId: tenant.id,
      businessUnitId: businessUnit.id,
      code: 'HRM-OPS',
      name: 'HRM Operations Rollout',
      status: 'ACTIVE',
    },
  });

  await Promise.all(
    employees.slice(0, 4).map((employee) =>
      prisma.projectAssignment.upsert({
        where: { projectId_employeeId: { projectId: project.id, employeeId: employee.id } },
        update: {},
        create: {
          tenantId: tenant.id,
          projectId: project.id,
          employeeId: employee.id,
          roleOnProject: 'Contributor',
          allocationPercent: 50,
        },
      }),
    ),
  );

  console.log(
    JSON.stringify(
      {
        message: 'Demo seed completed successfully.',
        tenantId: tenant.id,
        employees: employees.length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
