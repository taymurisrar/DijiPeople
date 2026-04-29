import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PayComponentCalculationMethod, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CompensationResolverService } from './compensation-resolver.service';
import { CreateCompensationComponentDto } from './dto/create-compensation-component.dto';
import { CreateCompensationHistoryDto } from './dto/create-compensation-history.dto';
import { UpdateCompensationComponentDto } from './dto/update-compensation-component.dto';
import { UpdateCompensationHistoryDto } from './dto/update-compensation-history.dto';

const compensationInclude = {
  components: {
    include: { payComponent: true },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.EmployeeCompensationHistoryInclude;

@Injectable()
export class CompensationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly compensationResolver: CompensationResolverService,
  ) {}

  async listHistory(currentUser: AuthenticatedUser, employeeId: string) {
    await this.ensureEmployeeBelongsToTenant(currentUser.tenantId, employeeId);
    const items = await this.prisma.employeeCompensationHistory.findMany({
      where: { tenantId: currentUser.tenantId, employeeId },
      include: compensationInclude,
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });

    return items.map(mapHistory);
  }

  async getHistory(
    currentUser: AuthenticatedUser,
    employeeId: string,
    historyId: string,
  ) {
    await this.ensureEmployeeBelongsToTenant(currentUser.tenantId, employeeId);
    const history = await this.findHistoryOrThrow(
      currentUser.tenantId,
      employeeId,
      historyId,
    );

    return mapHistory(history);
  }

  async getActive(currentUser: AuthenticatedUser, employeeId: string) {
    await this.ensureEmployeeBelongsToTenant(currentUser.tenantId, employeeId);
    const active = await this.compensationResolver.resolveActiveCompensation({
      tenantId: currentUser.tenantId,
      employeeId,
      effectiveDate: new Date(),
    });

    return active ? mapHistory(active) : null;
  }

  async createHistory(
    currentUser: AuthenticatedUser,
    employeeId: string,
    dto: CreateCompensationHistoryDto,
  ) {
    await this.ensureEmployeeBelongsToTenant(currentUser.tenantId, employeeId);
    const effectiveFrom = parseDate(dto.effectiveFrom);
    const effectiveTo = parseOptionalDate(dto.effectiveTo);
    assertDateRange(effectiveFrom, effectiveTo);
    await this.assertSingleActiveOpenEnded(
      currentUser.tenantId,
      employeeId,
      dto.status ?? 'DRAFT',
      effectiveTo,
    );

    const created = await this.prisma.employeeCompensationHistory.create({
      data: {
        tenantId: currentUser.tenantId,
        employeeId,
        effectiveFrom,
        effectiveTo,
        payFrequency: dto.payFrequency,
        currencyCode: normalizeCurrency(dto.currencyCode),
        baseAmount: new Prisma.Decimal(dto.baseAmount),
        status: dto.status ?? 'DRAFT',
        notes: normalizeOptionalText(dto.notes),
        createdBy: currentUser.userId,
      },
      include: compensationInclude,
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'COMPENSATION_HISTORY_CREATED',
      entityType: 'EmployeeCompensationHistory',
      entityId: created.id,
      afterSnapshot: created,
    });

    return mapHistory(created);
  }

  async updateHistory(
    currentUser: AuthenticatedUser,
    employeeId: string,
    historyId: string,
    dto: UpdateCompensationHistoryDto,
  ) {
    await this.ensureEmployeeBelongsToTenant(currentUser.tenantId, employeeId);
    const existing = await this.findHistoryOrThrow(
      currentUser.tenantId,
      employeeId,
      historyId,
    );
    const effectiveFrom =
      dto.effectiveFrom !== undefined
        ? parseDate(dto.effectiveFrom)
        : existing.effectiveFrom;
    const effectiveTo =
      dto.effectiveTo !== undefined
        ? parseOptionalDate(dto.effectiveTo)
        : existing.effectiveTo;
    const status = dto.status ?? existing.status;

    assertDateRange(effectiveFrom, effectiveTo);
    await this.assertSingleActiveOpenEnded(
      currentUser.tenantId,
      employeeId,
      status,
      effectiveTo,
      historyId,
    );

    const updated = await this.prisma.employeeCompensationHistory.update({
      where: { id: historyId },
      data: {
        ...(dto.effectiveFrom !== undefined ? { effectiveFrom } : {}),
        ...(dto.effectiveTo !== undefined ? { effectiveTo } : {}),
        ...(dto.payFrequency !== undefined
          ? { payFrequency: dto.payFrequency }
          : {}),
        ...(dto.currencyCode !== undefined
          ? { currencyCode: normalizeCurrency(dto.currencyCode) }
          : {}),
        ...(dto.baseAmount !== undefined
          ? { baseAmount: new Prisma.Decimal(dto.baseAmount) }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.notes !== undefined
          ? { notes: normalizeOptionalText(dto.notes) }
          : {}),
      },
      include: compensationInclude,
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action:
        updated.status === 'RETIRED'
          ? 'COMPENSATION_HISTORY_RETIRED'
          : 'COMPENSATION_HISTORY_UPDATED',
      entityType: 'EmployeeCompensationHistory',
      entityId: historyId,
      beforeSnapshot: existing,
      afterSnapshot: updated,
    });

    return mapHistory(updated);
  }

  async createComponent(
    currentUser: AuthenticatedUser,
    employeeId: string,
    historyId: string,
    dto: CreateCompensationComponentDto,
  ) {
    await this.ensureEmployeeBelongsToTenant(currentUser.tenantId, employeeId);
    await this.findHistoryOrThrow(currentUser.tenantId, employeeId, historyId);
    const payComponent = await this.findActivePayComponent(
      currentUser.tenantId,
      dto.payComponentId,
    );
    validateComponentValue(
      payComponent.calculationMethod,
      dto.amount,
      dto.percentage,
    );

    try {
      const created = await this.prisma.employeeCompensationComponent.create({
        data: {
          tenantId: currentUser.tenantId,
          compensationHistoryId: historyId,
          payComponentId: payComponent.id,
          amount: dto.amount ? new Prisma.Decimal(dto.amount) : null,
          percentage: dto.percentage
            ? new Prisma.Decimal(dto.percentage)
            : null,
          calculationMethodSnapshot: payComponent.calculationMethod,
          isRecurring: dto.isRecurring ?? payComponent.isRecurring,
          displayOrder: dto.displayOrder ?? payComponent.displayOrder,
        },
        include: { payComponent: true },
      });

      await this.auditService.log({
        tenantId: currentUser.tenantId,
        actorUserId: currentUser.userId,
        action: 'COMPENSATION_COMPONENT_CREATED',
        entityType: 'EmployeeCompensationComponent',
        entityId: created.id,
        afterSnapshot: created,
      });

      return mapComponent(created);
    } catch (error) {
      handleComponentWriteError(error);
    }
  }

  async updateComponent(
    currentUser: AuthenticatedUser,
    employeeId: string,
    historyId: string,
    componentId: string,
    dto: UpdateCompensationComponentDto,
  ) {
    await this.ensureEmployeeBelongsToTenant(currentUser.tenantId, employeeId);
    await this.findHistoryOrThrow(currentUser.tenantId, employeeId, historyId);
    const existing = await this.findComponentOrThrow(
      currentUser.tenantId,
      historyId,
      componentId,
    );
    const payComponent = dto.payComponentId
      ? await this.findActivePayComponent(
          currentUser.tenantId,
          dto.payComponentId,
        )
      : existing.payComponent;
    const amount =
      dto.amount !== undefined ? dto.amount : existing.amount?.toString();
    const percentage =
      dto.percentage !== undefined
        ? dto.percentage
        : existing.percentage?.toString();

    validateComponentValue(payComponent.calculationMethod, amount, percentage);

    try {
      const updated = await this.prisma.employeeCompensationComponent.update({
        where: { id: componentId },
        data: {
          ...(dto.payComponentId !== undefined
            ? {
                payComponentId: payComponent.id,
                calculationMethodSnapshot: payComponent.calculationMethod,
              }
            : {}),
          ...(dto.amount !== undefined
            ? { amount: dto.amount ? new Prisma.Decimal(dto.amount) : null }
            : {}),
          ...(dto.percentage !== undefined
            ? {
                percentage: dto.percentage
                  ? new Prisma.Decimal(dto.percentage)
                  : null,
              }
            : {}),
          ...(dto.isRecurring !== undefined
            ? { isRecurring: dto.isRecurring }
            : {}),
          ...(dto.displayOrder !== undefined
            ? { displayOrder: dto.displayOrder }
            : {}),
        },
        include: { payComponent: true },
      });

      await this.auditService.log({
        tenantId: currentUser.tenantId,
        actorUserId: currentUser.userId,
        action: 'COMPENSATION_COMPONENT_UPDATED',
        entityType: 'EmployeeCompensationComponent',
        entityId: componentId,
        beforeSnapshot: existing,
        afterSnapshot: updated,
      });

      return mapComponent(updated);
    } catch (error) {
      handleComponentWriteError(error);
    }
  }

  async deleteComponent(
    currentUser: AuthenticatedUser,
    employeeId: string,
    historyId: string,
    componentId: string,
  ) {
    await this.ensureEmployeeBelongsToTenant(currentUser.tenantId, employeeId);
    await this.findHistoryOrThrow(currentUser.tenantId, employeeId, historyId);
    const existing = await this.findComponentOrThrow(
      currentUser.tenantId,
      historyId,
      componentId,
    );

    await this.prisma.employeeCompensationComponent.delete({
      where: { id: componentId },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'COMPENSATION_COMPONENT_DELETED',
      entityType: 'EmployeeCompensationComponent',
      entityId: componentId,
      beforeSnapshot: existing,
    });

    return { deleted: true, id: componentId };
  }

  private async ensureEmployeeBelongsToTenant(
    tenantId: string,
    employeeId: string,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId, id: employeeId },
      select: { id: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee was not found for this tenant.');
    }
  }

  private async findHistoryOrThrow(
    tenantId: string,
    employeeId: string,
    historyId: string,
  ) {
    const history = await this.prisma.employeeCompensationHistory.findFirst({
      where: { tenantId, employeeId, id: historyId },
      include: compensationInclude,
    });

    if (!history) {
      throw new NotFoundException(
        'Compensation history was not found for this employee.',
      );
    }

    return history;
  }

  private async findComponentOrThrow(
    tenantId: string,
    historyId: string,
    componentId: string,
  ) {
    const component = await this.prisma.employeeCompensationComponent.findFirst(
      {
        where: { tenantId, compensationHistoryId: historyId, id: componentId },
        include: { payComponent: true },
      },
    );

    if (!component) {
      throw new NotFoundException(
        'Compensation component was not found for this history record.',
      );
    }

    return component;
  }

  private async findActivePayComponent(
    tenantId: string,
    payComponentId: string,
  ) {
    const payComponent = await this.prisma.payComponent.findFirst({
      where: { tenantId, id: payComponentId, isActive: true },
    });

    if (!payComponent) {
      throw new BadRequestException(
        'Component must reference an active pay component in the same tenant.',
      );
    }

    return payComponent;
  }

  private async assertSingleActiveOpenEnded(
    tenantId: string,
    employeeId: string,
    status: string,
    effectiveTo: Date | null,
    excludeId?: string,
  ) {
    if (status !== 'ACTIVE' || effectiveTo !== null) {
      return;
    }

    const existing = await this.prisma.employeeCompensationHistory.findFirst({
      where: {
        tenantId,
        employeeId,
        status: 'ACTIVE',
        effectiveTo: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        'Only one ACTIVE open-ended compensation record is allowed per employee.',
      );
    }
  }
}

function parseDate(value: string) {
  return new Date(value);
}

function parseOptionalDate(value: string | undefined) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return new Date(value);
}

function assertDateRange(effectiveFrom: Date, effectiveTo: Date | null) {
  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw new BadRequestException(
      'effectiveTo must be greater than or equal to effectiveFrom.',
    );
  }
}

function normalizeCurrency(value: string) {
  return value.trim().toUpperCase();
}

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function validateComponentValue(
  calculationMethod: PayComponentCalculationMethod,
  amount?: string | null,
  percentage?: string | null,
) {
  if (calculationMethod === 'FIXED' && !amount) {
    throw new BadRequestException('Fixed components require amount.');
  }

  if (calculationMethod === 'PERCENTAGE' && !percentage) {
    throw new BadRequestException('Percentage components require percentage.');
  }
}

function handleComponentWriteError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ConflictException(
      'This pay component is already assigned to the compensation history record.',
    );
  }

  throw error;
}

function mapHistory(
  history: Prisma.EmployeeCompensationHistoryGetPayload<{
    include: typeof compensationInclude;
  }>,
) {
  return {
    ...history,
    baseAmount: history.baseAmount.toString(),
    components: history.components.map(mapComponent),
  };
}

function mapComponent(
  component: Prisma.EmployeeCompensationComponentGetPayload<{
    include: { payComponent: true };
  }>,
) {
  return {
    ...component,
    amount: component.amount?.toString() ?? null,
    percentage: component.percentage?.toString() ?? null,
  };
}
