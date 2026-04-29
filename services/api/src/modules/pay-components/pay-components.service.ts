import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AuditService } from '../audit/audit.service';
import { CreatePayComponentDto } from './dto/create-pay-component.dto';
import { ListPayComponentsDto } from './dto/list-pay-components.dto';
import { UpdatePayComponentDto } from './dto/update-pay-component.dto';

@Injectable()
export class PayComponentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  findAll(tenantId: string, query: ListPayComponentsDto) {
    return this.prisma.payComponent.findMany({
      where: {
        tenantId,
        ...(query.componentType ? { componentType: query.componentType } : {}),
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
        ...(query.search?.trim()
          ? {
              OR: [
                {
                  code: { contains: query.search.trim(), mode: 'insensitive' },
                },
                {
                  name: { contains: query.search.trim(), mode: 'insensitive' },
                },
                {
                  description: {
                    contains: query.search.trim(),
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [
        { isActive: 'desc' },
        { displayOrder: 'asc' },
        { componentType: 'asc' },
        { code: 'asc' },
      ],
    });
  }

  async findOne(tenantId: string, id: string) {
    const component = await this.prisma.payComponent.findFirst({
      where: { tenantId, id },
    });

    if (!component) {
      throw new NotFoundException(
        'Pay component was not found for this tenant.',
      );
    }

    return component;
  }

  async create(currentUser: AuthenticatedUser, dto: CreatePayComponentDto) {
    try {
      const created = await this.prisma.payComponent.create({
        data: {
          tenantId: currentUser.tenantId,
          code: normalizeCode(dto.code),
          name: dto.name.trim(),
          description: normalizeOptionalText(dto.description),
          componentType: dto.componentType,
          calculationMethod: dto.calculationMethod,
          isTaxable: dto.isTaxable ?? false,
          affectsGrossPay: dto.affectsGrossPay ?? true,
          affectsNetPay: dto.affectsNetPay ?? true,
          isRecurring: dto.isRecurring ?? false,
          requiresApproval: dto.requiresApproval ?? false,
          displayOnPayslip: dto.displayOnPayslip ?? true,
          displayOrder: dto.displayOrder ?? 0,
          isActive: dto.isActive ?? true,
        },
      });

      await this.auditService.log({
        tenantId: currentUser.tenantId,
        actorUserId: currentUser.userId,
        action: 'PAY_COMPONENT_CREATED',
        entityType: 'PayComponent',
        entityId: created.id,
        afterSnapshot: created,
      });

      return created;
    } catch (error) {
      this.handleUniqueError(error);
    }
  }

  async update(
    currentUser: AuthenticatedUser,
    id: string,
    dto: UpdatePayComponentDto,
  ) {
    const existing = await this.findOne(currentUser.tenantId, id);

    try {
      const updated = await this.prisma.payComponent.update({
        where: { id },
        data: {
          ...(dto.code !== undefined ? { code: normalizeCode(dto.code) } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: normalizeOptionalText(dto.description) }
            : {}),
          ...(dto.componentType !== undefined
            ? { componentType: dto.componentType }
            : {}),
          ...(dto.calculationMethod !== undefined
            ? { calculationMethod: dto.calculationMethod }
            : {}),
          ...(dto.isTaxable !== undefined ? { isTaxable: dto.isTaxable } : {}),
          ...(dto.affectsGrossPay !== undefined
            ? { affectsGrossPay: dto.affectsGrossPay }
            : {}),
          ...(dto.affectsNetPay !== undefined
            ? { affectsNetPay: dto.affectsNetPay }
            : {}),
          ...(dto.isRecurring !== undefined
            ? { isRecurring: dto.isRecurring }
            : {}),
          ...(dto.requiresApproval !== undefined
            ? { requiresApproval: dto.requiresApproval }
            : {}),
          ...(dto.displayOnPayslip !== undefined
            ? { displayOnPayslip: dto.displayOnPayslip }
            : {}),
          ...(dto.displayOrder !== undefined
            ? { displayOrder: dto.displayOrder }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      await this.auditService.log({
        tenantId: currentUser.tenantId,
        actorUserId: currentUser.userId,
        action: 'PAY_COMPONENT_UPDATED',
        entityType: 'PayComponent',
        entityId: id,
        beforeSnapshot: existing,
        afterSnapshot: updated,
      });

      return updated;
    } catch (error) {
      this.handleUniqueError(error);
    }
  }

  async deactivate(currentUser: AuthenticatedUser, id: string) {
    const existing = await this.findOne(currentUser.tenantId, id);
    const updated = await this.prisma.payComponent.update({
      where: { id },
      data: { isActive: false },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'PAY_COMPONENT_DEACTIVATED',
      entityType: 'PayComponent',
      entityId: id,
      beforeSnapshot: existing,
      afterSnapshot: updated,
    });

    return updated;
  }

  private handleUniqueError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'Pay component code is already in use for this tenant.',
      );
    }

    throw error;
  }
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
