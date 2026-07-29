import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CreateEmploymentTypeDto } from './dto/create-employment-type.dto';
import { ListEmploymentTypesDto } from './dto/list-employment-types.dto';
import { UpdateEmploymentTypeDto } from './dto/update-employment-type.dto';

@Injectable()
export class EmploymentTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  findAll(tenantId: string, query: ListEmploymentTypesDto) {
    const search = query.search?.trim();
    return this.prisma.employmentType.findMany({
      where: {
        tenantId,
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        _count: { select: { employees: true } },
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(tenantId: string, id: string) {
    const record = await this.prisma.employmentType.findFirst({
      where: { tenantId, id },
      include: {
        _count: { select: { employees: true } },
      },
    });
    if (!record) {
      throw new NotFoundException(
        'Employment type was not found for this tenant.',
      );
    }
    return record;
  }

  async create(currentUser: AuthenticatedUser, dto: CreateEmploymentTypeDto) {
    try {
      const created = await this.prisma.employmentType.create({
        data: {
          tenantId: currentUser.tenantId,
          name: dto.name.trim(),
          code: normalizeCode(dto.code),
          description: normalizeOptionalText(dto.description),
          payrollEligible: dto.payrollEligible ?? true,
          leaveEligible: dto.leaveEligible ?? true,
          overtimeEligible: dto.overtimeEligible ?? false,
          benefitsEligible: dto.benefitsEligible ?? true,
          defaultProbationDays: dto.defaultProbationDays ?? 0,
          isActive: dto.isActive ?? true,
          createdById: currentUser.userId,
          updatedById: currentUser.userId,
        },
      });

      await this.auditService.log({
        tenantId: currentUser.tenantId,
        actorUserId: currentUser.userId,
        action: 'EMPLOYMENT_TYPE_CREATED',
        entityType: 'EmploymentType',
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
    dto: UpdateEmploymentTypeDto,
  ) {
    const existing = await this.findOne(currentUser.tenantId, id);

    try {
      const updated = await this.prisma.employmentType.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.code !== undefined ? { code: normalizeCode(dto.code) } : {}),
          ...(dto.description !== undefined
            ? { description: normalizeOptionalText(dto.description) }
            : {}),
          ...(dto.payrollEligible !== undefined
            ? { payrollEligible: dto.payrollEligible }
            : {}),
          ...(dto.leaveEligible !== undefined
            ? { leaveEligible: dto.leaveEligible }
            : {}),
          ...(dto.overtimeEligible !== undefined
            ? { overtimeEligible: dto.overtimeEligible }
            : {}),
          ...(dto.benefitsEligible !== undefined
            ? { benefitsEligible: dto.benefitsEligible }
            : {}),
          ...(dto.defaultProbationDays !== undefined
            ? { defaultProbationDays: dto.defaultProbationDays }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          updatedById: currentUser.userId,
        },
      });

      await this.auditService.log({
        tenantId: currentUser.tenantId,
        actorUserId: currentUser.userId,
        action: 'EMPLOYMENT_TYPE_UPDATED',
        entityType: 'EmploymentType',
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
    if (existing._count.employees > 0) {
      throw new ConflictException(
        'Employment type cannot be deleted while employees reference it.',
      );
    }
    return this.update(currentUser, id, { isActive: false });
  }

  private handleUniqueError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'Employment type name or code is already in use for this tenant.',
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
