import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PayrollCycleStatus,
  PayrollRecordStatus,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmployeesRepository } from '../employees/employees.repository';
import { TenantSettingsResolverService } from '../tenant-settings/tenant-settings-resolver.service';
import { CreateEmployeeCompensationDto } from './dto/create-employee-compensation.dto';
import { CreatePayrollCycleDto } from './dto/create-payroll-cycle.dto';
import { PayrollCycleQueryDto } from './dto/payroll-cycle-query.dto';
import { UpdateEmployeeCompensationDto } from './dto/update-employee-compensation.dto';
import {
  EmployeeCompensationWithRelations,
  PayrollCycleWithRelations,
  PayrollRepository,
} from './payroll.repository';

@Injectable()
export class PayrollService {
  constructor(
    private readonly payrollRepository: PayrollRepository,
    private readonly employeesRepository: EmployeesRepository,
    private readonly prisma: PrismaService,
    private readonly tenantSettingsResolverService: TenantSettingsResolverService,
  ) {}

  async listCycles(tenantId: string, query: PayrollCycleQueryDto) {
    const { items, total } = await this.payrollRepository.findCycles(
      tenantId,
      query,
    );

    return {
      items: items.map((cycle) => this.mapCycle(cycle)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
      filters: {
        status: query.status ?? null,
      },
    };
  }

  async getCycleById(tenantId: string, cycleId: string) {
    const cycle = await this.payrollRepository.findCycleById(tenantId, cycleId);

    if (!cycle) {
      throw new NotFoundException('Payroll cycle was not found for this tenant.');
    }

    return this.mapCycle(cycle);
  }

  async createCycle(currentUser: AuthenticatedUser, dto: CreatePayrollCycleDto) {
    validatePeriodRange(dto.periodStart, dto.periodEnd);

    try {
      const cycle = await this.payrollRepository.createCycle({
        tenantId: currentUser.tenantId,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        runDate: dto.runDate ? new Date(dto.runDate) : undefined,
        status: 'DRAFT',
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      });

      return this.mapCycle(cycle);
    } catch (error) {
      handlePayrollWriteError(error, 'Payroll cycle already exists for this period.');
    }
  }

  async listCompensations(tenantId: string) {
    const items = await this.payrollRepository.listCompensations(tenantId);
    return items.map((compensation) => this.mapCompensation(compensation));
  }

  async createCompensation(
    currentUser: AuthenticatedUser,
    dto: CreateEmployeeCompensationDto,
  ) {
    await this.ensureEmployeeBelongsToTenant(currentUser.tenantId, dto.employeeId);
    validateCompensationRange(dto.effectiveDate, dto.endDate);
    const payrollSettings = await this.tenantSettingsResolverService.getPayrollSettings(
      currentUser.tenantId,
    );

    try {
      const compensation = await this.payrollRepository.createCompensation({
        tenantId: currentUser.tenantId,
        employeeId: dto.employeeId,
        basicSalary: new Prisma.Decimal(dto.basicSalary),
        payFrequency: dto.payFrequency || payrollSettings.payFrequency,
        effectiveDate: new Date(dto.effectiveDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        currency:
          dto.currency?.trim().toUpperCase() ??
          payrollSettings.defaultCurrency ??
          'USD',
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      });

      return this.mapCompensation(compensation);
    } catch (error) {
      handlePayrollWriteError(
        error,
        'Compensation already exists for this employee on the selected effective date.',
      );
    }
  }

  async updateCompensation(
    currentUser: AuthenticatedUser,
    compensationId: string,
    dto: UpdateEmployeeCompensationDto,
  ) {
    const existing = await this.payrollRepository.findCompensationById(
      currentUser.tenantId,
      compensationId,
    );

    if (!existing) {
      throw new NotFoundException(
        'Employee compensation was not found for this tenant.',
      );
    }

    if (dto.employeeId) {
      await this.ensureEmployeeBelongsToTenant(currentUser.tenantId, dto.employeeId);
    }

    validateCompensationRange(
      dto.effectiveDate ?? existing.effectiveDate.toISOString(),
      dto.endDate ?? existing.endDate?.toISOString(),
    );

    try {
      const result = await this.payrollRepository.updateCompensation(
        currentUser.tenantId,
        compensationId,
        {
          ...(dto.employeeId ? { employeeId: dto.employeeId } : {}),
          ...(dto.basicSalary
            ? { basicSalary: new Prisma.Decimal(dto.basicSalary) }
            : {}),
          ...(dto.payFrequency ? { payFrequency: dto.payFrequency } : {}),
          ...(dto.effectiveDate
            ? { effectiveDate: new Date(dto.effectiveDate) }
            : {}),
          ...(dto.endDate !== undefined
            ? { endDate: dto.endDate ? new Date(dto.endDate) : null }
            : {}),
          ...(dto.currency !== undefined
            ? { currency: dto.currency.trim().toUpperCase() }
            : {}),
          updatedById: currentUser.userId,
        },
      );

      if (result.count === 0) {
        throw new NotFoundException(
          'Employee compensation was not found for this tenant.',
        );
      }

      return this.listCompensations(currentUser.tenantId);
    } catch (error) {
      handlePayrollWriteError(
        error,
        'Compensation already exists for this employee on the selected effective date.',
      );
    }
  }

  async generateDraftRecords(currentUser: AuthenticatedUser, cycleId: string) {
    const cycle = await this.payrollRepository.findCycleById(
      currentUser.tenantId,
      cycleId,
    );

    if (!cycle) {
      throw new NotFoundException('Payroll cycle was not found for this tenant.');
    }

    if (cycle.status === PayrollCycleStatus.FINALIZED) {
      throw new BadRequestException(
        'Finalized payroll cycles cannot generate draft records again.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const eligibleEmployees =
        await this.payrollRepository.findEligibleEmployeesForPayrollDrafts(
          currentUser.tenantId,
          cycle.periodStart,
          cycle.periodEnd,
          tx,
        );

      const records = eligibleEmployees
        .filter((employee) => employee.compensations.length > 0)
        .map((employee) => {
          const compensation = employee.compensations[0];
          const basicSalary = compensation.basicSalary;

          return {
            tenantId: currentUser.tenantId,
            employeeId: employee.id,
            payrollCycleId: cycle.id,
            gross: basicSalary,
            deductions: new Prisma.Decimal(0),
            net: basicSalary,
            status: PayrollRecordStatus.DRAFT,
            lineItems: [
              {
                code: 'BASIC',
                label: 'Basic Salary',
                type: 'EARNING',
                amount: basicSalary.toString(),
                payFrequency: compensation.payFrequency,
              },
            ],
            createdById: currentUser.userId,
            updatedById: currentUser.userId,
          };
        });

      if (records.length > 0) {
        await this.payrollRepository.createPayrollRecordsMany(records, tx);
      }

      await this.payrollRepository.updateCycle(
        currentUser.tenantId,
        cycle.id,
        {
          status:
            cycle.status === PayrollCycleStatus.DRAFT
              ? PayrollCycleStatus.PROCESSING
              : cycle.status,
          runDate: new Date(),
          updatedById: currentUser.userId,
        },
        tx,
      );
    });

    return this.getCycleById(currentUser.tenantId, cycleId);
  }

  private async ensureEmployeeBelongsToTenant(tenantId: string, employeeId: string) {
    const employee = await this.employeesRepository.findHierarchyNodeByIdAndTenant(
      tenantId,
      employeeId,
    );

    if (!employee) {
      throw new BadRequestException(
        'Selected employee does not belong to this tenant.',
      );
    }
  }

  private mapCycle(cycle: PayrollCycleWithRelations) {
    return {
      id: cycle.id,
      tenantId: cycle.tenantId,
      periodStart: cycle.periodStart,
      periodEnd: cycle.periodEnd,
      runDate: cycle.runDate,
      status: cycle.status,
      createdAt: cycle.createdAt,
      updatedAt: cycle.updatedAt,
      counts: {
        records: cycle._count.records,
      },
      records: cycle.records.map((record) => ({
        id: record.id,
        employeeId: record.employeeId,
        payrollCycleId: record.payrollCycleId,
        gross: record.gross.toString(),
        deductions: record.deductions.toString(),
        net: record.net.toString(),
        status: record.status,
        lineItems: record.lineItems,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        employee: {
          id: record.employee.id,
          employeeCode: record.employee.employeeCode,
          firstName: record.employee.firstName,
          lastName: record.employee.lastName,
          preferredName: record.employee.preferredName,
          fullName: `${record.employee.firstName} ${record.employee.lastName}`,
          employmentStatus: record.employee.employmentStatus,
          department: record.employee.department,
          designation: record.employee.designation,
        },
      })),
    };
  }

  private mapCompensation(compensation: EmployeeCompensationWithRelations) {
    return {
      id: compensation.id,
      tenantId: compensation.tenantId,
      employeeId: compensation.employeeId,
      basicSalary: compensation.basicSalary.toString(),
      payFrequency: compensation.payFrequency,
      effectiveDate: compensation.effectiveDate,
      endDate: compensation.endDate,
      currency: compensation.currency,
      createdAt: compensation.createdAt,
      updatedAt: compensation.updatedAt,
      employee: {
        id: compensation.employee.id,
        employeeCode: compensation.employee.employeeCode,
        firstName: compensation.employee.firstName,
        lastName: compensation.employee.lastName,
        preferredName: compensation.employee.preferredName,
        fullName: `${compensation.employee.firstName} ${compensation.employee.lastName}`,
        employmentStatus: compensation.employee.employmentStatus,
        department: compensation.employee.department,
        designation: compensation.employee.designation,
      },
    };
  }
}

function validatePeriodRange(periodStart: string, periodEnd: string) {
  if (new Date(periodEnd) < new Date(periodStart)) {
    throw new BadRequestException(
      'Payroll cycle end date cannot be earlier than start date.',
    );
  }
}

function validateCompensationRange(effectiveDate: string, endDate?: string | null) {
  if (endDate && new Date(endDate) < new Date(effectiveDate)) {
    throw new BadRequestException(
      'Compensation end date cannot be earlier than effective date.',
    );
  }
}

function handlePayrollWriteError(error: unknown, message: string): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ConflictException(message);
  }

  throw error;
}
