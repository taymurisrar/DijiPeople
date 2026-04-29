import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PolicyAssignmentScopeType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AuditService } from '../audit/audit.service';
import { CreatePolicyAssignmentDto } from './dto/create-policy-assignment.dto';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { ListPoliciesDto } from './dto/list-policies.dto';
import { UpdatePolicyAssignmentDto } from './dto/update-policy-assignment.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';

@Injectable()
export class PoliciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  findAll(tenantId: string, query: ListPoliciesDto) {
    return this.prisma.policy.findMany({
      where: {
        tenantId,
        ...(query.policyType ? { policyType: query.policyType } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
        ...(query.search?.trim()
          ? {
              OR: [
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
      include: { assignments: true },
      orderBy: [
        { policyType: 'asc' },
        { effectiveFrom: 'desc' },
        { version: 'desc' },
      ],
    });
  }

  async findOne(tenantId: string, id: string) {
    const policy = await this.prisma.policy.findFirst({
      where: { tenantId, id },
      include: { assignments: true },
    });

    if (!policy) {
      throw new NotFoundException('Policy was not found for this tenant.');
    }

    return policy;
  }

  async create(currentUser: AuthenticatedUser, dto: CreatePolicyDto) {
    const effectiveFrom = parseDate(dto.effectiveFrom);
    const effectiveTo = parseOptionalDate(dto.effectiveTo);
    assertDateRange(effectiveFrom, effectiveTo);

    try {
      const created = await this.prisma.policy.create({
        data: {
          tenantId: currentUser.tenantId,
          policyType: dto.policyType,
          name: dto.name.trim(),
          description: normalizeOptionalText(dto.description),
          version: dto.version,
          status: dto.status ?? 'DRAFT',
          effectiveFrom,
          effectiveTo,
          isActive: dto.isActive ?? true,
          createdBy: currentUser.userId,
        },
      });

      await this.auditService.log({
        tenantId: currentUser.tenantId,
        actorUserId: currentUser.userId,
        action: 'POLICY_CREATED',
        entityType: 'Policy',
        entityId: created.id,
        afterSnapshot: created,
      });

      return created;
    } catch (error) {
      this.handleUniqueError(error, 'Policy');
    }
  }

  async update(
    currentUser: AuthenticatedUser,
    id: string,
    dto: UpdatePolicyDto,
  ) {
    const existing = await this.findOne(currentUser.tenantId, id);
    const effectiveFrom =
      dto.effectiveFrom !== undefined
        ? parseDate(dto.effectiveFrom)
        : existing.effectiveFrom;
    const effectiveTo =
      dto.effectiveTo !== undefined
        ? parseOptionalDate(dto.effectiveTo)
        : existing.effectiveTo;
    assertDateRange(effectiveFrom, effectiveTo);

    try {
      const updated = await this.prisma.policy.update({
        where: { id },
        data: {
          ...(dto.policyType !== undefined
            ? { policyType: dto.policyType }
            : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: normalizeOptionalText(dto.description) }
            : {}),
          ...(dto.version !== undefined ? { version: dto.version } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.effectiveFrom !== undefined ? { effectiveFrom } : {}),
          ...(dto.effectiveTo !== undefined ? { effectiveTo } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      await this.auditService.log({
        tenantId: currentUser.tenantId,
        actorUserId: currentUser.userId,
        action: 'POLICY_UPDATED',
        entityType: 'Policy',
        entityId: id,
        beforeSnapshot: existing,
        afterSnapshot: updated,
      });

      return updated;
    } catch (error) {
      this.handleUniqueError(error, 'Policy');
    }
  }

  async deactivate(currentUser: AuthenticatedUser, id: string) {
    const existing = await this.findOne(currentUser.tenantId, id);
    const updated = await this.prisma.policy.update({
      where: { id },
      data: { isActive: false, status: 'RETIRED' },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'POLICY_RETIRED',
      entityType: 'Policy',
      entityId: id,
      beforeSnapshot: existing,
      afterSnapshot: updated,
    });

    return updated;
  }

  findAssignments(tenantId: string, policyId?: string) {
    return this.prisma.policyAssignment.findMany({
      where: {
        tenantId,
        ...(policyId ? { policyId } : {}),
      },
      include: { policy: true },
      orderBy: [
        { scopeType: 'asc' },
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async createAssignment(
    currentUser: AuthenticatedUser,
    dto: CreatePolicyAssignmentDto,
  ) {
    await this.assertPolicyExists(currentUser.tenantId, dto.policyId);
    await this.assertScopeValid(
      currentUser.tenantId,
      dto.scopeType,
      dto.scopeId ?? null,
    );

    const created = await this.prisma.policyAssignment.create({
      data: {
        tenantId: currentUser.tenantId,
        policyId: dto.policyId,
        scopeType: dto.scopeType,
        scopeId:
          dto.scopeType === PolicyAssignmentScopeType.TENANT
            ? null
            : dto.scopeId,
        priority: dto.priority,
        isActive: dto.isActive ?? true,
      },
      include: { policy: true },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'POLICY_ASSIGNMENT_CREATED',
      entityType: 'PolicyAssignment',
      entityId: created.id,
      afterSnapshot: created,
    });

    return created;
  }

  async updateAssignment(
    currentUser: AuthenticatedUser,
    id: string,
    dto: UpdatePolicyAssignmentDto,
  ) {
    const existing = await this.findAssignmentById(currentUser.tenantId, id);
    const nextPolicyId = dto.policyId ?? existing.policyId;
    const nextScopeType = dto.scopeType ?? existing.scopeType;
    const nextScopeId =
      dto.scopeId !== undefined ? dto.scopeId : existing.scopeId;

    await this.assertPolicyExists(currentUser.tenantId, nextPolicyId);
    await this.assertScopeValid(
      currentUser.tenantId,
      nextScopeType,
      nextScopeId ?? null,
    );

    const updated = await this.prisma.policyAssignment.update({
      where: { id },
      data: {
        ...(dto.policyId !== undefined ? { policyId: dto.policyId } : {}),
        ...(dto.scopeType !== undefined ? { scopeType: dto.scopeType } : {}),
        scopeId:
          nextScopeType === PolicyAssignmentScopeType.TENANT
            ? null
            : nextScopeId,
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: { policy: true },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'POLICY_ASSIGNMENT_UPDATED',
      entityType: 'PolicyAssignment',
      entityId: id,
      beforeSnapshot: existing,
      afterSnapshot: updated,
    });

    return updated;
  }

  async deactivateAssignment(currentUser: AuthenticatedUser, id: string) {
    const existing = await this.findAssignmentById(currentUser.tenantId, id);
    const updated = await this.prisma.policyAssignment.update({
      where: { id },
      data: { isActive: false },
      include: { policy: true },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'POLICY_ASSIGNMENT_DEACTIVATED',
      entityType: 'PolicyAssignment',
      entityId: id,
      beforeSnapshot: existing,
      afterSnapshot: updated,
    });

    return updated;
  }

  private async findAssignmentById(tenantId: string, id: string) {
    const assignment = await this.prisma.policyAssignment.findFirst({
      where: { tenantId, id },
      include: { policy: true },
    });

    if (!assignment) {
      throw new NotFoundException(
        'Policy assignment was not found for this tenant.',
      );
    }

    return assignment;
  }

  private async assertPolicyExists(tenantId: string, policyId: string) {
    const policy = await this.prisma.policy.findFirst({
      where: { tenantId, id: policyId },
      select: { id: true },
    });

    if (!policy) {
      throw new BadRequestException(
        'Policy assignment must reference a policy in the same tenant.',
      );
    }
  }

  private async assertScopeValid(
    tenantId: string,
    scopeType: PolicyAssignmentScopeType,
    scopeId: string | null,
  ) {
    if (scopeType === PolicyAssignmentScopeType.TENANT) {
      if (scopeId) {
        throw new BadRequestException(
          'Tenant policy assignments do not use scopeId.',
        );
      }
      return;
    }

    if (!scopeId) {
      throw new BadRequestException(
        `${scopeType} policy assignments require scopeId.`,
      );
    }

    const exists = await this.scopeExists(tenantId, scopeType, scopeId);
    if (!exists) {
      throw new BadRequestException(
        'Policy assignment scope must belong to the same tenant.',
      );
    }
  }

  private async scopeExists(
    tenantId: string,
    scopeType: PolicyAssignmentScopeType,
    scopeId: string,
  ) {
    switch (scopeType) {
      case PolicyAssignmentScopeType.ORGANIZATION:
        return Boolean(
          await this.prisma.organization.findFirst({
            where: { tenantId, id: scopeId },
            select: { id: true },
          }),
        );
      case PolicyAssignmentScopeType.BUSINESS_UNIT:
        return Boolean(
          await this.prisma.businessUnit.findFirst({
            where: { tenantId, id: scopeId },
            select: { id: true },
          }),
        );
      case PolicyAssignmentScopeType.DEPARTMENT:
        return Boolean(
          await this.prisma.department.findFirst({
            where: { tenantId, id: scopeId },
            select: { id: true },
          }),
        );
      case PolicyAssignmentScopeType.EMPLOYEE_LEVEL:
        return Boolean(
          await this.prisma.employeeLevel.findFirst({
            where: { tenantId, id: scopeId },
            select: { id: true },
          }),
        );
      case PolicyAssignmentScopeType.EMPLOYEE:
        return Boolean(
          await this.prisma.employee.findFirst({
            where: { tenantId, id: scopeId },
            select: { id: true },
          }),
        );
      default:
        return false;
    }
  }

  private handleUniqueError(error: unknown, label: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        `${label} name and version already exist for this policy type.`,
      );
    }

    throw error;
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

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
