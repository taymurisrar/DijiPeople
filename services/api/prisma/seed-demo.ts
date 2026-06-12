import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import {
  AttendanceEntrySource,
  AttendanceEntryStatus,
  AttendanceMode,
  EmployeeEmploymentStatus,
  EmployeeRecordType,
  EmployeeType,
  EmployeeWorkMode,
  LeaveRequestStatus,
  NotificationEventCategory,
  NotificationStatus,
  NotificationType,
  PayComponentCalculationMethod,
  PayComponentType,
  Prisma,
  TimesheetStatus,
  UserStatus,
  WorkWeekday,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ROLE_KEYS } from '../src/common/constants/rbac-matrix';
import { createPrismaClient } from './create-prisma-client';

loadEnv({ path: resolve(__dirname, '../.env') });
loadEnv();

const prisma = createPrismaClient();

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
    where: {
      tenantId_name: { tenantId: tenant.id, name: 'DijiPeople Demo HQ' },
    },
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
  const secondaryLocation = await prisma.location.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'RUH' } },
    update: {
      isActive: true,
      latitude: 24.7136,
      longitude: 46.6753,
      allowedRadiusMeters: 250,
    },
    create: {
      tenantId: tenant.id,
      code: 'RUH',
      name: 'Riyadh Office',
      addressLine1: 'King Fahd Road',
      city: 'Riyadh',
      state: 'Riyadh',
      country: 'Saudi Arabia',
      timezone: 'Asia/Riyadh',
      latitude: 24.7136,
      longitude: 46.6753,
      allowedRadiusMeters: 250,
    },
  });

  const seededUsers = await seedRoleBasedUsers({
    tenantId: tenant.id,
    businessUnitId: businessUnit.id,
    departmentId: hrDepartment.id,
    designationId: managerDesignation.id,
    locationId: secondaryLocation.id,
  });

  const employees = await Promise.all(
    [
      [
        'DP-1001',
        'Ayesha',
        'Khan',
        'ayesha.demo@dijipeople.local',
        hrDepartment.id,
        managerDesignation.id,
      ],
      [
        'DP-1002',
        'Omar',
        'Farooq',
        'omar.demo@dijipeople.local',
        engineeringDepartment.id,
        engineerDesignation.id,
      ],
      [
        'DP-1003',
        'Sara',
        'Ahmed',
        'sara.demo@dijipeople.local',
        financeDepartment.id,
        financeDesignation.id,
      ],
      [
        'DP-1004',
        'Bilal',
        'Hassan',
        'bilal.demo@dijipeople.local',
        engineeringDepartment.id,
        engineerDesignation.id,
      ],
      [
        'DP-1005',
        'Mariam',
        'Ali',
        'mariam.demo@dijipeople.local',
        hrDepartment.id,
        engineerDesignation.id,
      ],
      [
        'DP-1006',
        'Zain',
        'Malik',
        'zain.demo@dijipeople.local',
        financeDepartment.id,
        financeDesignation.id,
      ],
      [
        'DP-1007',
        'Noor',
        'Saeed',
        'noor.demo@dijipeople.local',
        engineeringDepartment.id,
        engineerDesignation.id,
      ],
      [
        'DP-1008',
        'Hamza',
        'Raza',
        'hamza.demo@dijipeople.local',
        engineeringDepartment.id,
        engineerDesignation.id,
      ],
    ].map(
      ([
        employeeCode,
        firstName,
        lastName,
        email,
        departmentId,
        designationId,
      ]) =>
        prisma.employee.upsert({
          where: {
            tenantId_employeeCode: { tenantId: tenant.id, employeeCode },
          },
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

  const defaultCalendar = await prisma.holidayCalendar.upsert({
    where: {
      tenantId_code: { tenantId: tenant.id, code: 'SAUDI_STANDARD' },
    },
    update: {
      name: 'Saudi Standard Calendar',
      timezone: 'Asia/Riyadh',
      countryCode: 'SA',
      weekendDays: [WorkWeekday.FRIDAY, WorkWeekday.SATURDAY],
      isDefault: true,
      status: 'ACTIVE',
    },
    create: {
      tenantId: tenant.id,
      name: 'Saudi Standard Calendar',
      code: 'SAUDI_STANDARD',
      timezone: 'Asia/Riyadh',
      countryCode: 'SA',
      weekendDays: [WorkWeekday.FRIDAY, WorkWeekday.SATURDAY],
      isDefault: true,
      status: 'ACTIVE',
    },
  });
  await prisma.holiday.upsert({
    where: {
      holidayCalendarId_holidayDate_name: {
        holidayCalendarId: defaultCalendar.id,
        holidayDate: new Date('2026-09-23T00:00:00.000Z'),
        name: 'Saudi National Day',
      },
    },
    update: {
      scopeType: 'TENANT',
      isPaid: true,
      isActive: true,
      status: 'ACTIVE',
    },
    create: {
      tenantId: tenant.id,
      holidayCalendarId: defaultCalendar.id,
      name: 'Saudi National Day',
      holidayDate: new Date('2026-09-23T00:00:00.000Z'),
      type: 'PUBLIC',
      scopeType: 'TENANT',
      isPaid: true,
      isActive: true,
      appliesToAll: true,
      status: 'ACTIVE',
    },
  });

  const defaultSchedule = await prisma.workSchedule.upsert({
    where: {
      tenantId_code: { tenantId: tenant.id, code: 'STANDARD_WEEK' },
    },
    update: {
      isDefault: true,
      isActive: true,
      timezone: 'Asia/Riyadh',
      holidayCalendarId: defaultCalendar.id,
      weeklyWorkDays: [
        WorkWeekday.SUNDAY,
        WorkWeekday.MONDAY,
        WorkWeekday.TUESDAY,
        WorkWeekday.WEDNESDAY,
        WorkWeekday.THURSDAY,
      ],
    },
    create: {
      tenantId: tenant.id,
      name: 'Standard Sunday to Thursday',
      code: 'STANDARD_WEEK',
      timezone: 'Asia/Riyadh',
      holidayCalendarId: defaultCalendar.id,
      workWeekModel: 'FIVE_DAY',
      weeklyWorkDays: [
        WorkWeekday.SUNDAY,
        WorkWeekday.MONDAY,
        WorkWeekday.TUESDAY,
        WorkWeekday.WEDNESDAY,
        WorkWeekday.THURSDAY,
      ],
      standardStartTime: '09:00',
      standardEndTime: '17:00',
      standardHoursPerWeek: new Prisma.Decimal(40),
      isDefault: true,
      isActive: true,
      status: 'ACTIVE',
    },
  });
  const [dayShift, nightShift] = await Promise.all([
    prisma.shiftTemplate.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: 'DAY' } },
      update: {
        workScheduleId: defaultSchedule.id,
        isActive: true,
        status: 'ACTIVE',
      },
      create: {
        tenantId: tenant.id,
        workScheduleId: defaultSchedule.id,
        name: 'Day Shift',
        code: 'DAY',
        timezone: 'Asia/Riyadh',
        startTime: '09:00',
        endTime: '17:00',
        breakMinutes: 60,
        expectedHours: new Prisma.Decimal(8),
        lateGraceMinutes: 10,
        earlyExitGraceMinutes: 10,
        isNightShift: false,
        isActive: true,
      },
    }),
    prisma.shiftTemplate.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: 'NIGHT' } },
      update: { isActive: true, status: 'ACTIVE' },
      create: {
        tenantId: tenant.id,
        name: 'Night Shift',
        code: 'NIGHT',
        timezone: 'Asia/Riyadh',
        startTime: '21:00',
        endTime: '05:00',
        breakMinutes: 60,
        expectedHours: new Prisma.Decimal(8),
        lateGraceMinutes: 10,
        earlyExitGraceMinutes: 10,
        isNightShift: true,
        isActive: true,
      },
    }),
  ]);
  await Promise.all(
    [
      WorkWeekday.SUNDAY,
      WorkWeekday.MONDAY,
      WorkWeekday.TUESDAY,
      WorkWeekday.WEDNESDAY,
      WorkWeekday.THURSDAY,
    ].map(async (dayOfWeek, sortOrder) => {
      const existingDay = await prisma.workScheduleDay.findFirst({
        where: {
          workScheduleId: defaultSchedule.id,
          dayOfWeek,
          rotationWeek: null,
        },
        select: { id: true },
      });
      const data = {
        shiftTemplateId: dayShift.id,
        isWorkingDay: true,
        startTime: dayShift.startTime,
        endTime: dayShift.endTime,
        breakMinutes: dayShift.breakMinutes,
        expectedHours: dayShift.expectedHours,
        sortOrder,
      };
      return existingDay
        ? prisma.workScheduleDay.update({
            where: { id: existingDay.id },
            data,
          })
        : prisma.workScheduleDay.create({
            data: {
              tenantId: tenant.id,
              workScheduleId: defaultSchedule.id,
              dayOfWeek,
              ...data,
            },
          });
    }),
  );
  await Promise.all([
    prisma.department.update({
      where: { id: engineeringDepartment.id },
      data: { defaultWorkScheduleId: defaultSchedule.id },
    }),
    prisma.location.update({
      where: { id: location.id },
      data: {
        defaultWorkScheduleId: defaultSchedule.id,
        holidayCalendarId: defaultCalendar.id,
      },
    }),
  ]);
  await prisma.employeeScheduleAssignment.upsert({
    where: {
      tenantId_employeeId_workScheduleId_effectiveFrom: {
        tenantId: tenant.id,
        employeeId: seededUsers.employee.employeeId,
        workScheduleId: defaultSchedule.id,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    },
    update: { isActive: true, effectiveTo: null },
    create: {
      tenantId: tenant.id,
      employeeId: seededUsers.employee.employeeId,
      workScheduleId: defaultSchedule.id,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      isActive: true,
    },
  });

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
      [
        'TRANSPORT_ALLOWANCE',
        'Transport Allowance',
        PayComponentType.ALLOWANCE,
      ],
      ['OVERTIME', 'Overtime', PayComponentType.EARNING],
      [
        'UNPAID_LEAVE_DEDUCTION',
        'Unpaid Leave Deduction',
        PayComponentType.DEDUCTION,
      ],
      [
        'MANUAL_REIMBURSEMENT',
        'Manual Reimbursement',
        PayComponentType.REIMBURSEMENT,
      ],
    ].map(([code, name, componentType], index) =>
      prisma.payComponent.upsert({
        where: { tenantId_code: { tenantId: tenant.id, code: String(code) } },
        update: {
          name: String(name),
          componentType: componentType as PayComponentType,
        },
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
        where: {
          projectId_employeeId: {
            projectId: project.id,
            employeeId: employee.id,
          },
        },
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

  await seedOperationalFixtures({
    tenantId: tenant.id,
    businessUnitId: businessUnit.id,
    employeeId: seededUsers.employee.employeeId,
    employeeUserId: seededUsers.employee.userId,
    managerUserId: seededUsers.manager.userId,
    hrUserId: seededUsers.hr.userId,
    workScheduleId: defaultSchedule.id,
    shiftTemplateId: dayShift.id,
    officeLocationId: secondaryLocation.id,
    projectId: project.id,
  });

  console.log(
    JSON.stringify(
      {
        message: 'Demo seed completed successfully.',
        tenantId: tenant.id,
        employees: employees.length,
        roleBasedUsers: Object.keys(seededUsers).length,
        workSites: 2,
        shifts: [dayShift.code, nightShift.code],
        defaultWorkSchedule: defaultSchedule.code,
      },
      null,
      2,
    ),
  );
}

async function seedRoleBasedUsers(input: {
  tenantId: string;
  businessUnitId: string;
  departmentId: string;
  designationId: string;
  locationId: string;
}) {
  const passwordHash = await bcrypt.hash(
    env('DEMO_USER_PASSWORD', 'DemoUser@12345'),
    10,
  );
  const definitions = {
    ceo: {
      email: 'ceo@dijipeople.local',
      firstName: 'Demo',
      lastName: 'CEO',
      employeeCode: 'DP-CEO',
      roleKeys: [
        ROLE_KEYS.GLOBAL_ADMIN,
        ROLE_KEYS.SYSTEM_ADMIN,
        ROLE_KEYS.SYSTEM_CUSTOMIZER,
      ],
    },
    hr: {
      email: 'hr@dijipeople.local',
      firstName: 'Demo',
      lastName: 'HR',
      employeeCode: 'DP-HR',
      roleKeys: [ROLE_KEYS.HR],
    },
    recruiter: {
      email: 'recruiter@dijipeople.local',
      firstName: 'Demo',
      lastName: 'Recruiter',
      employeeCode: 'DP-REC',
      roleKeys: [ROLE_KEYS.RECRUITER],
    },
    employee: {
      email: 'employee@dijipeople.local',
      firstName: 'Demo',
      lastName: 'Employee',
      employeeCode: 'DP-ESS',
      roleKeys: [ROLE_KEYS.EMPLOYEE],
    },
    manager: {
      email: 'manager@dijipeople.local',
      firstName: 'Demo',
      lastName: 'Manager',
      employeeCode: 'DP-MGR',
      roleKeys: [ROLE_KEYS.EMPLOYEE, ROLE_KEYS.MANAGER],
    },
  } as const;
  const roleKeys = [
    ...new Set(Object.values(definitions).flatMap((item) => item.roleKeys)),
  ];
  const roles = await prisma.role.findMany({
    where: { tenantId: input.tenantId, key: { in: roleKeys } },
    select: { id: true, key: true },
  });
  const roleIdByKey = new Map(roles.map((role) => [role.key, role.id]));
  const result: Record<
    keyof typeof definitions,
    { userId: string; employeeId: string }
  > = {} as never;

  for (const [key, definition] of Object.entries(definitions) as Array<
    [keyof typeof definitions, (typeof definitions)[keyof typeof definitions]]
  >) {
    const existingUser = await prisma.user.findFirst({
      where: { tenantId: input.tenantId, email: definition.email },
      select: { id: true },
    });
    const user = existingUser
      ? await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            businessUnitId: input.businessUnitId,
            firstName: definition.firstName,
            lastName: definition.lastName,
            passwordHash,
            status: UserStatus.ACTIVE,
          },
        })
      : await prisma.user.create({
          data: {
            tenantId: input.tenantId,
            businessUnitId: input.businessUnitId,
            firstName: definition.firstName,
            lastName: definition.lastName,
            email: definition.email,
            passwordHash,
            status: UserStatus.ACTIVE,
          },
        });
    for (const roleKey of definition.roleKeys) {
      const roleId = roleIdByKey.get(roleKey);
      if (!roleId) {
        throw new Error(
          `Required demo role "${roleKey}" was not bootstrapped.`,
        );
      }
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId } },
        update: {},
        create: {
          tenantId: input.tenantId,
          userId: user.id,
          roleId,
        },
      });
    }
    const employee = await prisma.employee.upsert({
      where: {
        tenantId_employeeCode: {
          tenantId: input.tenantId,
          employeeCode: definition.employeeCode,
        },
      },
      update: {
        userId: user.id,
        firstName: definition.firstName,
        lastName: definition.lastName,
        email: definition.email,
        employmentStatus: EmployeeEmploymentStatus.ACTIVE,
      },
      create: {
        tenantId: input.tenantId,
        businessUnitId: input.businessUnitId,
        userId: user.id,
        employeeCode: definition.employeeCode,
        recordType: EmployeeRecordType.INTERNAL_EMPLOYEE,
        firstName: definition.firstName,
        lastName: definition.lastName,
        email: definition.email,
        phone: '+966500000000',
        hireDate: new Date('2025-01-01T00:00:00.000Z'),
        employmentStatus: EmployeeEmploymentStatus.ACTIVE,
        employeeType: EmployeeType.FULL_TIME,
        workMode: EmployeeWorkMode.HYBRID,
        departmentId: input.departmentId,
        designationId: input.designationId,
        locationId: input.locationId,
        ownerUserId: user.id,
      },
    });
    result[key] = { userId: user.id, employeeId: employee.id };
  }

  await prisma.employee.update({
    where: { id: result.employee.employeeId },
    data: { managerEmployeeId: result.manager.employeeId },
  });

  return result;
}

async function seedOperationalFixtures(input: {
  tenantId: string;
  businessUnitId: string;
  employeeId: string;
  employeeUserId: string;
  managerUserId: string;
  hrUserId: string;
  workScheduleId: string;
  shiftTemplateId: string;
  officeLocationId: string;
  projectId: string;
}) {
  const leaveType = await prisma.leaveType.findFirstOrThrow({
    where: { tenantId: input.tenantId, code: 'ANNUAL' },
    select: { id: true },
  });
  const leaveStart = new Date('2026-07-20T00:00:00.000Z');
  const leaveEnd = new Date('2026-07-21T00:00:00.000Z');
  const existingLeave = await prisma.leaveRequest.findFirst({
    where: {
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      leaveTypeId: leaveType.id,
      startDate: leaveStart,
      endDate: leaveEnd,
    },
    select: { id: true },
  });
  const leaveRequest = existingLeave
    ? await prisma.leaveRequest.update({
        where: { id: existingLeave.id },
        data: {
          reason: 'Seeded annual leave awaiting manager approval.',
          status: LeaveRequestStatus.PENDING,
          totalDays: new Prisma.Decimal(2),
          updatedById: input.employeeUserId,
        },
      })
    : await prisma.leaveRequest.create({
        data: {
          tenantId: input.tenantId,
          employeeId: input.employeeId,
          leaveTypeId: leaveType.id,
          startDate: leaveStart,
          endDate: leaveEnd,
          totalDays: new Prisma.Decimal(2),
          reason: 'Seeded annual leave awaiting manager approval.',
          status: LeaveRequestStatus.PENDING,
          createdById: input.employeeUserId,
          updatedById: input.employeeUserId,
        },
      });

  const attendanceDate = new Date('2026-05-04T00:00:00.000Z');
  await prisma.attendanceEntry.upsert({
    where: {
      tenantId_employeeId_date: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        date: attendanceDate,
      },
    },
    update: {
      workScheduleId: input.workScheduleId,
      shiftTemplateId: input.shiftTemplateId,
      officeLocationId: input.officeLocationId,
      attendanceMode: AttendanceMode.OFFICE,
      status: AttendanceEntryStatus.PRESENT,
      source: AttendanceEntrySource.MANUAL,
      checkIn: new Date('2026-05-04T06:00:00.000Z'),
      checkOut: new Date('2026-05-04T14:00:00.000Z'),
      notes: 'Seeded attendance fixture.',
    },
    create: {
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      workScheduleId: input.workScheduleId,
      shiftTemplateId: input.shiftTemplateId,
      officeLocationId: input.officeLocationId,
      date: attendanceDate,
      attendanceMode: AttendanceMode.OFFICE,
      status: AttendanceEntryStatus.PRESENT,
      source: AttendanceEntrySource.MANUAL,
      checkIn: new Date('2026-05-04T06:00:00.000Z'),
      checkOut: new Date('2026-05-04T14:00:00.000Z'),
      notes: 'Seeded attendance fixture.',
      createdById: input.hrUserId,
      updatedById: input.hrUserId,
    },
  });

  const timesheet = await prisma.timesheet.upsert({
    where: {
      tenantId_employeeId_year_month: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        year: 2026,
        month: 5,
      },
    },
    update: {
      approverUserId: input.managerUserId,
      status: TimesheetStatus.SUBMITTED,
      submittedNote: 'Seeded timesheet awaiting manager approval.',
    },
    create: {
      tenantId: input.tenantId,
      businessUnitId: input.businessUnitId,
      employeeId: input.employeeId,
      year: 2026,
      month: 5,
      periodStart: new Date('2026-05-01T00:00:00.000Z'),
      periodEnd: new Date('2026-05-31T00:00:00.000Z'),
      status: TimesheetStatus.SUBMITTED,
      submittedAt: new Date('2026-06-01T08:00:00.000Z'),
      submittedNote: 'Seeded timesheet awaiting manager approval.',
      approverUserId: input.managerUserId,
      createdById: input.employeeUserId,
      updatedById: input.employeeUserId,
    },
  });
  const timesheetEntryDate = new Date('2026-05-04T00:00:00.000Z');
  const existingTimesheetEntry = await prisma.timesheetEntry.findFirst({
    where: {
      timesheetId: timesheet.id,
      date: timesheetEntryDate,
      projectId: input.projectId,
    },
    select: { id: true },
  });
  const timesheetEntryData = {
    hours: new Prisma.Decimal(8),
    dayOfWeek: WorkWeekday.MONDAY,
    projectId: input.projectId,
    note: 'Seeded project work entry.',
    billableFlag: true,
    updatedById: input.employeeUserId,
  };
  if (existingTimesheetEntry) {
    await prisma.timesheetEntry.update({
      where: { id: existingTimesheetEntry.id },
      data: timesheetEntryData,
    });
  } else {
    await prisma.timesheetEntry.create({
      data: {
        tenantId: input.tenantId,
        timesheetId: timesheet.id,
        employeeId: input.employeeId,
        date: timesheetEntryDate,
        createdById: input.employeeUserId,
        ...timesheetEntryData,
      },
    });
  }

  const notificationDedupeKey = `demo-leave-approval:${leaveRequest.id}`;
  const existingNotification = await prisma.notification.findFirst({
    where: {
      tenantId: input.tenantId,
      dedupeKey: notificationDedupeKey,
    },
    select: { id: true },
  });
  const notificationData = {
    recipientUserId: input.managerUserId,
    actorUserId: input.employeeUserId,
    eventCode: 'LEAVE_APPROVAL_REQUEST',
    eventKey: notificationDedupeKey,
    moduleKey: 'leaves',
    type: NotificationType.APPROVAL_REQUIRED,
    category: NotificationEventCategory.APPROVAL,
    title: 'Leave request requires approval',
    summary: 'Demo Employee submitted a seeded annual leave request.',
    relatedEntityType: 'LeaveRequest',
    relatedEntityId: leaveRequest.id,
    targetUrl: `/leaves/${leaveRequest.id}`,
    actionLabel: 'Review request',
    status: NotificationStatus.UNREAD,
    requiresAction: true,
    dedupeKey: notificationDedupeKey,
    tenantTimeZone: 'Asia/Riyadh',
    updatedAt: new Date(),
  };
  if (existingNotification) {
    await prisma.notification.update({
      where: { id: existingNotification.id },
      data: notificationData,
    });
  } else {
    await prisma.notification.create({
      data: {
        tenantId: input.tenantId,
        createdById: input.employeeUserId,
        ...notificationData,
      },
    });
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
