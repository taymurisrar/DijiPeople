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
      include: {
        parentEmployeeLevel: { select: { id: true, name: true, rank: true } },
        nextEmployeeLevel: { select: { id: true, name: true, rank: true } },
        _count: { select: { employees: true, designations: true } },
      },
      orderBy: [{ isActive: 'desc' }, { rank: 'asc' }, { code: 'asc' }],
    });
  }

  async findOne(tenantId: string, id: string) {
    const level = await this.prisma.employeeLevel.findFirst({
      where: { tenantId, id },
      include: {
        parentEmployeeLevel: { select: { id: true, name: true, rank: true } },
        nextEmployeeLevel: { select: { id: true, name: true, rank: true } },
        _count: { select: { employees: true, designations: true } },
      },
    });

    if (!level) {
      throw new NotFoundException(
        'Employee level was not found for this tenant.',
      );
    }

    return level;
  }

  async create(currentUser: AuthenticatedUser, dto: CreateEmployeeLevelDto) {
    await this.validateHierarchyFields(currentUser.tenantId, undefined, dto);
    try {
      const created = await this.prisma.employeeLevel.create({
        data: {
          tenantId: currentUser.tenantId,
          code: normalizeCode(dto.code ?? dto.name),
          name: dto.name.trim(),
          rank: dto.rank,
          parentEmployeeLevelId: dto.parentEmployeeLevelId,
          nextEmployeeLevelId: dto.nextEmployeeLevelId,
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
    await this.validateHierarchyFields(currentUser.tenantId, id, dto);

    try {
      const updated = await this.prisma.employeeLevel.update({
        where: { id },
        data: {
          ...(dto.code !== undefined ? { code: normalizeCode(dto.code) } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.rank !== undefined ? { rank: dto.rank } : {}),
          ...(dto.parentEmployeeLevelId !== undefined
            ? { parentEmployeeLevelId: dto.parentEmployeeLevelId }
            : {}),
          ...(dto.nextEmployeeLevelId !== undefined
            ? { nextEmployeeLevelId: dto.nextEmployeeLevelId }
            : {}),
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
    const references = await this.countBlockingReferences(
      currentUser.tenantId,
      id,
    );
    if (references > 0) {
      throw new ConflictException(
        'Employee level cannot be deleted while employees, designations, approval rules, payroll rules, or benefit policies reference it.',
      );
    }
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

  private async validateHierarchyFields(
    tenantId: string,
    currentId: string | undefined,
    dto:
      | Pick<
          CreateEmployeeLevelDto,
          'parentEmployeeLevelId' | 'nextEmployeeLevelId'
        >
      | Pick<
          UpdateEmployeeLevelDto,
          'parentEmployeeLevelId' | 'nextEmployeeLevelId'
        >,
  ) {
    for (const field of [
      'parentEmployeeLevelId',
      'nextEmployeeLevelId',
    ] as const) {
      const relatedId = dto[field];
      if (!relatedId) continue;
      if (relatedId === currentId) {
        throw new ConflictException(
          'Employee level hierarchy cannot reference itself.',
        );
      }
      await this.findOne(tenantId, relatedId);
    }

    if (currentId && dto.parentEmployeeLevelId) {
      await this.assertNoCircularParent(
        tenantId,
        currentId,
        dto.parentEmployeeLevelId,
      );
    }

    if (currentId && dto.nextEmployeeLevelId) {
      await this.assertNoCircularNext(
        tenantId,
        currentId,
        dto.nextEmployeeLevelId,
      );
    }
  }

  private async assertNoCircularParent(
    tenantId: string,
    currentId: string,
    parentId: string,
  ) {
    let cursor: string | null | undefined = parentId;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor === currentId || visited.has(cursor)) {
        throw new ConflictException(
          'Employee level parent hierarchy cannot be circular.',
        );
      }
      visited.add(cursor);
      const parent = await this.prisma.employeeLevel.findFirst({
        where: { tenantId, id: cursor },
        select: { parentEmployeeLevelId: true },
      });
      cursor = parent?.parentEmployeeLevelId;
    }
  }

  private async assertNoCircularNext(
    tenantId: string,
    currentId: string,
    nextId: string,
  ) {
    let cursor: string | null | undefined = nextId;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor === currentId || visited.has(cursor)) {
        throw new ConflictException(
          'Employee level next-level hierarchy cannot be circular.',
        );
      }
      visited.add(cursor);
      const next = await this.prisma.employeeLevel.findFirst({
        where: { tenantId, id: cursor },
        select: { nextEmployeeLevelId: true },
      });
      cursor = next?.nextEmployeeLevelId;
    }
  }

  private async countBlockingReferences(tenantId: string, id: string) {
    const [
      employees,
      designations,
      approvalMatrices,
      benefitPolicies,
      timePayrollPolicies,
      overtimePolicies,
      taxRules,
    ] = await Promise.all([
      this.prisma.employee.count({ where: { tenantId, employeeLevelId: id } }),
      this.prisma.designation.count({
        where: { tenantId, employeeLevelId: id },
      }),
      this.prisma.approvalMatrix.count({
        where: { tenantId, employeeLevelId: id },
      }),
      this.prisma.benefitPolicy.count({
        where: { tenantId, employeeLevelId: id },
      }),
      this.prisma.timePayrollPolicy.count({
        where: { tenantId, employeeLevelId: id },
      }),
      this.prisma.overtimePolicy.count({
        where: { tenantId, employeeLevelId: id },
      }),
      this.prisma.taxRule.count({ where: { tenantId, employeeLevelId: id } }),
    ]);
    return (
      employees +
      designations +
      approvalMatrices +
      benefitPolicies +
      timePayrollPolicies +
      overtimePolicies +
      taxRules
    );
  }
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
