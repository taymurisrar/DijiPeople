import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CreateEmployeeLevelDto } from './dto/create-employee-level.dto';
import { ListEmployeeLevelsDto } from './dto/list-employee-levels.dto';
import { UpdateEmployeeLevelDto } from './dto/update-employee-level.dto';

@Injectable()
export class EmployeeLevelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  findAll(tenantId: string, query: ListEmployeeLevelsDto) {
    return this.prisma.employeeLevel.findMany({
      where: {
        tenantId,
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
      orderBy: [{ isActive: 'desc' }, { rank: 'asc' }, { code: 'asc' }],
    });
  }

  async findOne(tenantId: string, id: string) {
    const level = await this.prisma.employeeLevel.findFirst({
      where: { tenantId, id },
    });

    if (!level) {
      throw new NotFoundException(
        'Employee level was not found for this tenant.',
      );
    }

    return level;
  }

  async create(currentUser: AuthenticatedUser, dto: CreateEmployeeLevelDto) {
    try {
      const created = await this.prisma.employeeLevel.create({
        data: {
          tenantId: currentUser.tenantId,
          code: normalizeCode(dto.code),
          name: dto.name.trim(),
          rank: dto.rank,
          description: normalizeOptionalText(dto.description),
          isActive: dto.isActive ?? true,
        },
      });

      await this.auditService.log({
        tenantId: currentUser.tenantId,
        actorUserId: currentUser.userId,
        action: 'EMPLOYEE_LEVEL_CREATED',
        entityType: 'EmployeeLevel',
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
    dto: UpdateEmployeeLevelDto,
  ) {
    const existing = await this.findOne(currentUser.tenantId, id);

    try {
      const updated = await this.prisma.employeeLevel.update({
        where: { id },
        data: {
          ...(dto.code !== undefined ? { code: normalizeCode(dto.code) } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.rank !== undefined ? { rank: dto.rank } : {}),
          ...(dto.description !== undefined
            ? { description: normalizeOptionalText(dto.description) }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      await this.auditService.log({
        tenantId: currentUser.tenantId,
        actorUserId: currentUser.userId,
        action: 'EMPLOYEE_LEVEL_UPDATED',
        entityType: 'EmployeeLevel',
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
    const updated = await this.prisma.employeeLevel.update({
      where: { id },
      data: { isActive: false },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'EMPLOYEE_LEVEL_DEACTIVATED',
      entityType: 'EmployeeLevel',
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
        'Employee level code is already in use for this tenant.',
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
