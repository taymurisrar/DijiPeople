import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateBusinessUnitDto } from './dto/create-business-unit.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { CreateDesignationDto } from './dto/create-designation.dto';
import { CreateLocationDto } from './dto/create-location.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { ListMasterDataDto } from './dto/list-master-data.dto';
import { UpdateBusinessUnitDto } from './dto/update-business-unit.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { UpdateDesignationDto } from './dto/update-designation.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationRepository } from './organization.repository';

export type OrganizationNode = {
  id: string;
  tenantId: string;
  name: string;
  status?: string;
  subStatus?: string;
  isActive?: boolean;
  parentOrganizationId: string | null;
  createdAt: Date;
  updatedAt: Date;
  children: OrganizationNode[];
};

export type BusinessUnitNode = {
  id: string;
  tenantId: string;
  name: string;
  organizationId: string;
  parentBusinessUnitId: string | null;
  status?: string;
  subStatus?: string;
  isActive?: boolean;
  createdAt: Date;
  updatedAt: Date;
  children: BusinessUnitNode[];
};

export type DepartmentNode = {
  id: string;
  tenantId: string;
  name: string;
  businessUnitId: string | null;
  isActive: boolean;
};

export type TeamNode = {
  id: string;
  tenantId: string;
  name: string;
  departmentId: string | null;
  isActive: boolean;
};

@Injectable()
export class OrganizationService {
  constructor(
    private readonly organizationRepository: OrganizationRepository,
    private readonly prisma: PrismaService,
  ) {}

  findOrganizations(tenantId: string) {
    return this.organizationRepository.findOrganizations(tenantId);
  }

  async findOrganizationById(tenantId: string, id: string) {
    const organization = await this.organizationRepository.findOrganizationById(
      tenantId,
      id,
    );

    if (!organization) {
      throw new NotFoundException(
        'Organization was not found for this tenant.',
      );
    }

    return organization;
  }

  async createOrganization(
    currentUser: AuthenticatedUser,
    dto: CreateOrganizationDto,
  ) {
    await this.assertOrganizationParentValid(
      currentUser.tenantId,
      null,
      dto.parentOrganizationId,
    );

    try {
      const ownerUserId = await this.resolveRecordOwnerId(
        currentUser,
        dto.ownerUserId,
      );
      await this.assertEmployeeInTenant(
        currentUser.tenantId,
        dto.headEmployeeId,
        'Organization head',
      );
      return await this.organizationRepository.createOrganization({
        tenantId: currentUser.tenantId,
        code: integrationIdentifier('ORG'),
        name: dto.name.trim(),
        organizationType:
          normalizeOptionalText(dto.organizationType) ?? 'OPERATING',
        parentOrganizationId: dto.parentOrganizationId ?? null,
        headEmployeeId: dto.headEmployeeId ?? null,
        ownerUserId,
        status: dto.status ?? 'ACTIVE',
        subStatus: normalizeSubStatus(dto.status ?? 'ACTIVE', dto.subStatus),
        description: normalizeOptionalText(dto.description ?? undefined),
        isActive: (dto.status ?? 'ACTIVE') === 'ACTIVE',
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      });
    } catch (error) {
      this.handleUniqueError(error, 'Organization');
    }
  }

  async updateOrganization(
    currentUser: AuthenticatedUser,
    id: string,
    dto: UpdateOrganizationDto,
  ) {
    const existing = await this.findOrganizationById(currentUser.tenantId, id);

    if (dto.parentOrganizationId !== undefined) {
      await this.assertOrganizationParentValid(
        currentUser.tenantId,
        id,
        dto.parentOrganizationId,
      );
    }

    try {
      if (dto.headEmployeeId !== undefined) {
        await this.assertEmployeeInTenant(
          currentUser.tenantId,
          dto.headEmployeeId,
          'Organization head',
        );
      }
      if (dto.ownerUserId !== undefined) {
        await this.assertUserInTenant(
          currentUser.tenantId,
          dto.ownerUserId,
          'Record owner',
        );
      }
      if (dto.isActive === false) {
        await this.assertOrganizationCanDeactivate(currentUser.tenantId, id);
      }
      const nextStatus =
        dto.status ??
        (dto.isActive === false
          ? 'INACTIVE'
          : dto.isActive === true
            ? 'ACTIVE'
            : undefined);
      const result = await this.organizationRepository.updateOrganization(
        currentUser.tenantId,
        id,
        {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.organizationType !== undefined
            ? {
                organizationType:
                  normalizeOptionalText(dto.organizationType) ?? 'OPERATING',
              }
            : {}),
          ...(dto.parentOrganizationId !== undefined
            ? { parentOrganizationId: dto.parentOrganizationId ?? null }
            : {}),
          ...(dto.headEmployeeId !== undefined
            ? { headEmployeeId: dto.headEmployeeId ?? null }
            : {}),
          ...(dto.ownerUserId !== undefined
            ? { ownerUserId: dto.ownerUserId ?? null }
            : {}),
          ...(nextStatus !== undefined
            ? { status: nextStatus, isActive: nextStatus === 'ACTIVE' }
            : {}),
          ...(dto.subStatus !== undefined || nextStatus !== undefined
            ? {
                subStatus: normalizeSubStatus(
                  nextStatus ?? dto.status ?? existing.status,
                  dto.subStatus,
                ),
              }
            : {}),
          ...(dto.description !== undefined
            ? {
                description: normalizeOptionalText(
                  dto.description ?? undefined,
                ),
              }
            : {}),
          ...(dto.isActive !== undefined && nextStatus === undefined
            ? { isActive: dto.isActive }
            : {}),
          updatedById: currentUser.userId,
        },
      );

      if (result.count === 0) {
        throw new NotFoundException(
          'Organization was not found for this tenant.',
        );
      }

      return this.findOrganizationById(currentUser.tenantId, id);
    } catch (error) {
      this.handleUniqueError(error, 'Organization');
    }
  }

  async deleteOrganization(currentUser: AuthenticatedUser, id: string) {
    await this.findOrganizationById(currentUser.tenantId, id);

    const [childCount, businessUnitCount, employeeCount] = await Promise.all([
      this.organizationRepository.countOrganizationChildren(
        currentUser.tenantId,
        id,
      ),
      this.organizationRepository.countOrganizationBusinessUnits(
        currentUser.tenantId,
        id,
      ),
      this.prisma.employee.count({
        where: {
          tenantId: currentUser.tenantId,
          organizationId: id,
          isDeleted: false,
        },
      }),
    ]);

    if (childCount > 0) {
      throw new ConflictException(
        'Organization cannot be deleted while child organizations exist.',
      );
    }

    if (businessUnitCount > 0) {
      throw new ConflictException(
        'Organization cannot be deleted while business units exist.',
      );
    }

    if (employeeCount > 0) {
      throw new ConflictException(
        'Organization cannot be deleted while employees reference it.',
      );
    }

    await this.organizationRepository.deleteOrganization(
      currentUser.tenantId,
      id,
    );
    return { deleted: true, id };
  }

  findBusinessUnits(tenantId: string, query: ListMasterDataDto = {}) {
    return this.organizationRepository.findBusinessUnits(tenantId, query);
  }

  async findBusinessUnitById(tenantId: string, id: string) {
    const businessUnit = await this.organizationRepository.findBusinessUnitById(
      tenantId,
      id,
    );

    if (!businessUnit) {
      throw new NotFoundException(
        'Business unit was not found for this tenant.',
      );
    }

    return businessUnit;
  }

  async createBusinessUnit(
    currentUser: AuthenticatedUser,
    dto: CreateBusinessUnitDto,
  ) {
    const organization = await this.findOrganizationById(
      currentUser.tenantId,
      dto.organizationId,
    );

    await this.assertBusinessUnitParentValid(
      currentUser.tenantId,
      null,
      dto.parentBusinessUnitId,
      organization.id,
    );

    try {
      const ownerUserId = await this.resolveRecordOwnerId(
        currentUser,
        dto.ownerUserId,
      );
      await this.assertEmployeeInTenant(
        currentUser.tenantId,
        dto.headEmployeeId,
        'Business unit head',
      );
      return await this.organizationRepository.createBusinessUnit({
        tenantId: currentUser.tenantId,
        code: integrationIdentifier('BU'),
        name: dto.name.trim(),
        organizationId: dto.organizationId,
        parentBusinessUnitId: dto.parentBusinessUnitId ?? null,
        type: dto.type ?? 'INTERNAL',
        headEmployeeId: dto.headEmployeeId ?? null,
        ownerUserId,
        status: dto.status ?? 'ACTIVE',
        subStatus: normalizeSubStatus(dto.status ?? 'ACTIVE', dto.subStatus),
        description: normalizeOptionalText(dto.description ?? undefined),
        isActive: (dto.status ?? 'ACTIVE') === 'ACTIVE',
        settingsJson: dto.settingsJson as Prisma.InputJsonValue | undefined,
        payrollContactName: dto.payrollContactName?.trim(),
        payrollContactEmail: dto.payrollContactEmail?.trim().toLowerCase(),
        payrollContactPhone: dto.payrollContactPhone?.trim(),
        approvalContactName: dto.approvalContactName?.trim(),
        approvalContactEmail: dto.approvalContactEmail?.trim().toLowerCase(),
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      });
    } catch (error) {
      this.handleUniqueError(error, 'Business unit');
    }
  }

  async updateBusinessUnit(
    currentUser: AuthenticatedUser,
    id: string,
    dto: UpdateBusinessUnitDto,
  ) {
    const existing = await this.findBusinessUnitById(currentUser.tenantId, id);
    const nextOrganizationId = dto.organizationId ?? existing.organizationId;

    await this.findOrganizationById(currentUser.tenantId, nextOrganizationId);

    if (
      dto.parentBusinessUnitId !== undefined ||
      dto.organizationId !== undefined
    ) {
      await this.assertBusinessUnitParentValid(
        currentUser.tenantId,
        id,
        dto.parentBusinessUnitId ?? existing.parentBusinessUnitId,
        nextOrganizationId,
      );
    }

    try {
      if (dto.headEmployeeId !== undefined) {
        await this.assertEmployeeInTenant(
          currentUser.tenantId,
          dto.headEmployeeId,
          'Business unit head',
        );
      }
      if (dto.ownerUserId !== undefined) {
        await this.assertUserInTenant(
          currentUser.tenantId,
          dto.ownerUserId,
          'Record owner',
        );
      }
      if (dto.isActive === false) {
        await this.assertBusinessUnitCanDeactivate(currentUser.tenantId, id);
      }
      const nextStatus =
        dto.status ??
        (dto.isActive === false
          ? 'INACTIVE'
          : dto.isActive === true
            ? 'ACTIVE'
            : undefined);
      const result = await this.organizationRepository.updateBusinessUnit(
        currentUser.tenantId,
        id,
        {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.organizationId !== undefined
            ? { organizationId: dto.organizationId }
            : {}),
          ...(dto.parentBusinessUnitId !== undefined
            ? { parentBusinessUnitId: dto.parentBusinessUnitId ?? null }
            : {}),
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(dto.headEmployeeId !== undefined
            ? { headEmployeeId: dto.headEmployeeId ?? null }
            : {}),
          ...(dto.ownerUserId !== undefined
            ? { ownerUserId: dto.ownerUserId ?? null }
            : {}),
          ...(nextStatus !== undefined
            ? { status: nextStatus, isActive: nextStatus === 'ACTIVE' }
            : {}),
          ...(dto.subStatus !== undefined || nextStatus !== undefined
            ? {
                subStatus: normalizeSubStatus(
                  nextStatus ?? dto.status ?? existing.status,
                  dto.subStatus,
                ),
              }
            : {}),
          ...(dto.description !== undefined
            ? {
                description: normalizeOptionalText(
                  dto.description ?? undefined,
                ),
              }
            : {}),
          ...(dto.isActive !== undefined && nextStatus === undefined
            ? { isActive: dto.isActive }
            : {}),
          ...(dto.settingsJson !== undefined
            ? {
                settingsJson:
                  (dto.settingsJson as Prisma.InputJsonValue | null) ??
                  Prisma.JsonNull,
              }
            : {}),
          ...(dto.payrollContactName !== undefined
            ? { payrollContactName: dto.payrollContactName?.trim() ?? null }
            : {}),
          ...(dto.payrollContactEmail !== undefined
            ? {
                payrollContactEmail:
                  dto.payrollContactEmail?.trim().toLowerCase() ?? null,
              }
            : {}),
          ...(dto.payrollContactPhone !== undefined
            ? { payrollContactPhone: dto.payrollContactPhone?.trim() ?? null }
            : {}),
          ...(dto.approvalContactName !== undefined
            ? { approvalContactName: dto.approvalContactName?.trim() ?? null }
            : {}),
          ...(dto.approvalContactEmail !== undefined
            ? {
                approvalContactEmail:
                  dto.approvalContactEmail?.trim().toLowerCase() ?? null,
              }
            : {}),
        },
      );

      if (result.count === 0) {
        throw new NotFoundException(
          'Business unit was not found for this tenant.',
        );
      }

      return this.findBusinessUnitById(currentUser.tenantId, id);
    } catch (error) {
      this.handleUniqueError(error, 'Business unit');
    }
  }

  async deleteBusinessUnit(currentUser: AuthenticatedUser, id: string) {
    await this.findBusinessUnitById(currentUser.tenantId, id);

    const [childCount, userCount, departmentCount, teamCount, employeeCount] =
      await Promise.all([
        this.organizationRepository.countBusinessUnitChildren(
          currentUser.tenantId,
          id,
        ),
        this.organizationRepository.countBusinessUnitUsers(
          currentUser.tenantId,
          id,
        ),
        this.organizationRepository.countBusinessUnitDepartments(
          currentUser.tenantId,
          id,
        ),
        this.organizationRepository.countBusinessUnitTeams(
          currentUser.tenantId,
          id,
        ),
        this.organizationRepository.countBusinessUnitEmployees(
          currentUser.tenantId,
          id,
        ),
      ]);

    if (childCount > 0) {
      throw new ConflictException(
        'Business unit cannot be deleted while child business units exist.',
      );
    }

    if (userCount > 0) {
      throw new ConflictException(
        'Business unit cannot be deleted while users are assigned to it.',
      );
    }

    if (departmentCount > 0 || teamCount > 0 || employeeCount > 0) {
      throw new ConflictException(
        'Business unit cannot be deleted while departments, teams, or employees reference it.',
      );
    }

    await this.organizationRepository.deleteBusinessUnit(
      currentUser.tenantId,
      id,
    );
    return { deleted: true, id };
  }

  async deleteDepartment(currentUser: AuthenticatedUser, id: string) {
    await this.findDepartmentById(currentUser.tenantId, id);
    const [teamCount, employeeCount] = await Promise.all([
      this.organizationRepository.countDepartmentTeams(
        currentUser.tenantId,
        id,
      ),
      this.organizationRepository.countDepartmentEmployees(
        currentUser.tenantId,
        id,
      ),
    ]);

    if (teamCount > 0 || employeeCount > 0) {
      throw new ConflictException(
        'Department cannot be deleted while teams or employees reference it.',
      );
    }

    return this.updateDepartment(currentUser, id, {
      isActive: false,
      status: 'INACTIVE',
      subStatus: 'ARCHIVED',
    });
  }

  async getChildOrganizations(tenantId: string, orgId: string) {
    await this.findOrganizationById(tenantId, orgId);
    const organizations =
      await this.organizationRepository.findOrganizations(tenantId);
    return organizations.filter((item) => item.parentOrganizationId === orgId);
  }

  async getParentOrganizations(tenantId: string, orgId: string) {
    await this.findOrganizationById(tenantId, orgId);
    const organizations =
      await this.organizationRepository.findOrganizations(tenantId);
    return this.fetchParentOrganizationChainFromFlat(organizations, orgId);
  }

  async getChildBusinessUnits(tenantId: string, businessUnitId: string) {
    await this.findBusinessUnitById(tenantId, businessUnitId);
    const businessUnits =
      await this.organizationRepository.findBusinessUnits(tenantId);
    return businessUnits.filter(
      (item) => item.parentBusinessUnitId === businessUnitId,
    );
  }

  async getParentBusinessUnits(tenantId: string, businessUnitId: string) {
    await this.findBusinessUnitById(tenantId, businessUnitId);
    const businessUnits =
      await this.organizationRepository.findBusinessUnits(tenantId);
    return this.fetchParentBusinessUnitChainFromFlat(
      businessUnits,
      businessUnitId,
    );
  }

  async fetchOrganizationSubtree(tenantId: string, orgId: string) {
    await this.findOrganizationById(tenantId, orgId);
    const organizations =
      await this.organizationRepository.findOrganizations(tenantId);
    const tree = this.buildOrganizationTree(organizations);
    return this.findOrganizationNode(tree, orgId);
  }

  async fetchBusinessUnitSubtree(tenantId: string, businessUnitId: string) {
    await this.findBusinessUnitById(tenantId, businessUnitId);
    const businessUnits =
      await this.organizationRepository.findBusinessUnits(tenantId);
    const tree = this.buildBusinessUnitTree(businessUnits);
    return this.findBusinessUnitNode(tree, businessUnitId);
  }

  async getHierarchyTree(tenantId: string) {
    const [organizations, businessUnits, departments, teams] =
      await Promise.all([
        this.organizationRepository.findOrganizations(tenantId),
        this.organizationRepository.findBusinessUnits(tenantId),
        this.organizationRepository.findDepartments(tenantId, {}),
        this.prisma.team.findMany({
          where: { tenantId },
          select: {
            id: true,
            tenantId: true,
            name: true,
            departmentId: true,
            isActive: true,
          },
          orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        }),
      ]);

    const organizationTree = this.buildOrganizationTree(organizations);
    const businessUnitTreeByOrganization = organizations.reduce<
      Record<string, BusinessUnitNode[]>
    >((acc, organization) => {
      const scoped = businessUnits.filter(
        (unit) => unit.organizationId === organization.id,
      );
      acc[organization.id] = this.buildBusinessUnitTree(scoped);
      return acc;
    }, {});
    const departmentsByBusinessUnit = departments.reduce<
      Record<string, DepartmentNode[]>
    >((acc, department) => {
      if (!department.businessUnitId) return acc;
      acc[department.businessUnitId] = acc[department.businessUnitId] ?? [];
      acc[department.businessUnitId].push({
        id: department.id,
        tenantId: department.tenantId,
        name: department.name,
        businessUnitId: department.businessUnitId,
        isActive: department.isActive,
      });
      return acc;
    }, {});
    const teamsByDepartment = teams.reduce<Record<string, TeamNode[]>>(
      (acc, team) => {
        if (!team.departmentId) return acc;
        acc[team.departmentId] = acc[team.departmentId] ?? [];
        acc[team.departmentId].push(team);
        return acc;
      },
      {},
    );

    return {
      organizations: organizationTree,
      businessUnitsByOrganization: businessUnitTreeByOrganization,
      departmentsByBusinessUnit,
      teamsByDepartment,
    };
  }

  findDepartments(tenantId: string, query: ListMasterDataDto) {
    return this.organizationRepository.findDepartments(tenantId, query);
  }

  async findDepartmentById(tenantId: string, id: string) {
    const department = await this.organizationRepository.findDepartmentById(
      tenantId,
      id,
    );

    if (!department) {
      throw new NotFoundException('Department was not found for this tenant.');
    }

    return department;
  }

  async createDepartment(
    currentUser: AuthenticatedUser,
    dto: CreateDepartmentDto,
  ) {
    await this.findBusinessUnitById(currentUser.tenantId, dto.businessUnitId);
    await this.assertEmployeeInTenant(
      currentUser.tenantId,
      dto.headEmployeeId,
      'Department head',
    );
    const ownerUserId = await this.resolveRecordOwnerId(
      currentUser,
      dto.ownerUserId,
    );
    try {
      return await this.organizationRepository.createDepartment({
        tenantId: currentUser.tenantId,
        businessUnitId: dto.businessUnitId,
        name: dto.name.trim(),
        code: dto.code?.trim().toUpperCase() ?? integrationIdentifier('DEP'),
        description: dto.description?.trim(),
        headEmployeeId: dto.headEmployeeId ?? null,
        ownerUserId,
        status: dto.status ?? 'ACTIVE',
        subStatus: normalizeSubStatus(dto.status ?? 'ACTIVE', dto.subStatus),
        isActive: (dto.status ?? 'ACTIVE') === 'ACTIVE',
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      });
    } catch (error) {
      this.handleUniqueError(error, 'Department');
    }
  }

  async updateDepartment(
    currentUser: AuthenticatedUser,
    id: string,
    dto: UpdateDepartmentDto,
  ) {
    const existing = await this.findDepartmentById(currentUser.tenantId, id);
    if (dto.businessUnitId) {
      await this.findBusinessUnitById(currentUser.tenantId, dto.businessUnitId);
    }
    if (dto.headEmployeeId !== undefined) {
      await this.assertEmployeeInTenant(
        currentUser.tenantId,
        dto.headEmployeeId,
        'Department head',
      );
    }
    if (dto.ownerUserId !== undefined) {
      await this.assertUserInTenant(
        currentUser.tenantId,
        dto.ownerUserId,
        'Record owner',
      );
    }
    if (dto.isActive === false) {
      await this.assertDepartmentCanDeactivate(currentUser.tenantId, id);
    }
    const nextStatus =
      dto.status ??
      (dto.isActive === false
        ? 'INACTIVE'
        : dto.isActive === true
          ? 'ACTIVE'
          : undefined);
    const result = await this.organizationRepository.updateDepartment(
      currentUser.tenantId,
      id,
      {
        ...(dto.businessUnitId !== undefined
          ? { businessUnitId: dto.businessUnitId }
          : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.code !== undefined
          ? { code: dto.code?.trim().toUpperCase() ?? null }
          : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() ?? null }
          : {}),
        ...(dto.headEmployeeId !== undefined
          ? { headEmployeeId: dto.headEmployeeId ?? null }
          : {}),
        ...(dto.ownerUserId !== undefined
          ? { ownerUserId: dto.ownerUserId ?? null }
          : {}),
        ...(nextStatus !== undefined
          ? { status: nextStatus, isActive: nextStatus === 'ACTIVE' }
          : {}),
        ...(dto.subStatus !== undefined || nextStatus !== undefined
          ? {
              subStatus: normalizeSubStatus(
                nextStatus ?? dto.status ?? existing.status,
                dto.subStatus,
              ),
            }
          : {}),
        ...(dto.isActive !== undefined && nextStatus === undefined
          ? { isActive: dto.isActive }
          : {}),
        updatedById: currentUser.userId,
      },
    );

    if (result.count === 0) {
      throw new NotFoundException('Department was not found for this tenant.');
    }

    return this.findDepartmentById(currentUser.tenantId, id);
  }

  findDesignations(tenantId: string, query: ListMasterDataDto) {
    return this.organizationRepository.findDesignations(tenantId, query);
  }

  async findDesignationById(tenantId: string, id: string) {
    const designation = await this.organizationRepository.findDesignationById(
      tenantId,
      id,
    );

    if (!designation) {
      throw new NotFoundException('Designation was not found for this tenant.');
    }

    return designation;
  }

  async createDesignation(
    currentUser: AuthenticatedUser,
    dto: CreateDesignationDto,
  ) {
    const name = dto.name.trim();
    const employeeLevel = await this.resolveEmployeeLevel(
      currentUser.tenantId,
      dto.employeeLevelId,
    );

    try {
      await this.prepareDesignationNameForActiveUse(currentUser.tenantId, name);

      return await this.organizationRepository.createDesignation({
        tenantId: currentUser.tenantId,
        name,
        level: employeeLevel
          ? employeeLevel.code
          : normalizeOptionalText(dto.level),
        employeeLevelId: employeeLevel?.id ?? null,
        description: dto.description?.trim(),
        isActive: dto.isActive ?? true,
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      });
    } catch (error) {
      this.handleUniqueError(error, 'Designation');
    }
  }

  async updateDesignation(
    currentUser: AuthenticatedUser,
    id: string,
    dto: UpdateDesignationDto,
  ) {
    const nextName = dto.name?.trim();
    const employeeLevel =
      dto.employeeLevelId !== undefined
        ? await this.resolveEmployeeLevel(
            currentUser.tenantId,
            dto.employeeLevelId,
          )
        : undefined;
    if (nextName) {
      await this.prepareDesignationNameForActiveUse(
        currentUser.tenantId,
        nextName,
        id,
      );
    }

    const result = await this.organizationRepository.updateDesignation(
      currentUser.tenantId,
      id,
      {
        ...(nextName ? { name: nextName } : {}),
        ...(employeeLevel !== undefined
          ? {
              employeeLevelId: employeeLevel?.id ?? null,
              level: employeeLevel
                ? employeeLevel.code
                : normalizeOptionalText(dto.level),
            }
          : {}),
        ...(dto.employeeLevelId === undefined && dto.level !== undefined
          ? { level: normalizeOptionalText(dto.level) }
          : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() ?? null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedById: currentUser.userId,
      },
    );

    if (result.count === 0) {
      throw new NotFoundException('Designation was not found for this tenant.');
    }

    return this.findDesignationById(currentUser.tenantId, id);
  }

  async deleteDesignation(currentUser: AuthenticatedUser, id: string) {
    const currentDesignation = await this.findDesignationById(
      currentUser.tenantId,
      id,
    );
    const [employeeCount, jobOpeningCount] = await Promise.all([
      this.prisma.employee.count({
        where: { tenantId: currentUser.tenantId, designationId: id },
      }),
      this.prisma.jobOpening.count({
        where: {
          tenantId: currentUser.tenantId,
          OR: [
            { title: currentDesignation.name },
            ...(currentDesignation.level
              ? [{ title: currentDesignation.level }]
              : []),
          ],
        },
      }),
    ]);

    if (employeeCount > 0 || jobOpeningCount > 0) {
      throw new ConflictException(
        'Designation cannot be deleted while employees or recruitment records reference it.',
      );
    }

    const result = await this.organizationRepository.updateDesignation(
      currentUser.tenantId,
      id,
      {
        name: archivedDesignationName(currentDesignation.name, id),
        isActive: false,
        updatedById: currentUser.userId,
      },
    );

    if (result.count === 0) {
      throw new NotFoundException('Designation was not found for this tenant.');
    }

    return this.findDesignationById(currentUser.tenantId, id);
  }

  private async prepareDesignationNameForActiveUse(
    tenantId: string,
    name: string,
    excludeId?: string,
  ) {
    const activeConflict = await this.prisma.designation.findFirst({
      where: {
        tenantId,
        name,
        isActive: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (activeConflict) {
      throw new ConflictException(
        'Designation name is already in use for this tenant.',
      );
    }

    const inactiveConflicts = await this.prisma.designation.findMany({
      where: {
        tenantId,
        name,
        isActive: false,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, name: true },
    });

    await Promise.all(
      inactiveConflicts.map((designation) =>
        this.prisma.designation.update({
          where: { id: designation.id },
          data: {
            name: archivedDesignationName(designation.name, designation.id),
          },
        }),
      ),
    );
  }

  private async resolveEmployeeLevel(
    tenantId: string,
    employeeLevelId: string | undefined,
  ) {
    const trimmed = employeeLevelId?.trim();
    if (!trimmed) return null;

    const employeeLevel = await this.prisma.employeeLevel.findFirst({
      where: { tenantId, id: trimmed, isActive: true },
      select: { id: true, code: true, name: true },
    });

    if (!employeeLevel) {
      throw new NotFoundException(
        'Selected employee level does not belong to this tenant or is inactive.',
      );
    }

    return employeeLevel;
  }

  findLocations(tenantId: string, query: ListMasterDataDto) {
    return this.organizationRepository.findLocations(tenantId, query);
  }

  async findLocationById(tenantId: string, id: string) {
    const location = await this.organizationRepository.findLocationById(
      tenantId,
      id,
    );

    if (!location) {
      throw new NotFoundException('Location was not found for this tenant.');
    }

    return location;
  }

  async createLocation(currentUser: AuthenticatedUser, dto: CreateLocationDto) {
    await this.assertLocationWorkConfiguration(
      currentUser.tenantId,
      dto.defaultWorkScheduleId,
      dto.holidayCalendarId,
    );
    try {
      return await this.organizationRepository.createLocation({
        tenantId: currentUser.tenantId,
        name: dto.name.trim(),
        code: dto.code?.trim().toUpperCase(),
        addressLine1: dto.addressLine1?.trim(),
        addressLine2: dto.addressLine2?.trim(),
        city: dto.city.trim(),
        state: dto.state.trim(),
        country: dto.country.trim(),
        zipCode: dto.zipCode?.trim(),
        timezone: dto.timezone?.trim(),
        latitude: dto.latitude,
        longitude: dto.longitude,
        allowedRadiusMeters: dto.allowedRadiusMeters,
        // Attendance configuration. Left undefined when not supplied so the
        // column keeps its null default, which means "inherit the tenant
        // setting" rather than "disabled".
        attendanceEnabled: dto.attendanceEnabled ?? undefined,
        maximumAccuracyMeters: dto.maximumAccuracyMeters ?? undefined,
        allowedAttendanceMethods: dto.allowedAttendanceMethods,
        webAttendancePolicy: dto.webAttendancePolicy ?? undefined,
        devicePolicy: dto.devicePolicy ?? undefined,
        webFallbackEnabled: dto.webFallbackEnabled ?? undefined,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validTo: dto.validTo ? new Date(dto.validTo) : undefined,
        defaultWorkScheduleId: dto.defaultWorkScheduleId,
        holidayCalendarId: dto.holidayCalendarId,
        isActive: dto.isActive ?? true,
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      });
    } catch (error) {
      this.handleUniqueError(error, 'Location');
    }
  }

  async updateLocation(
    currentUser: AuthenticatedUser,
    id: string,
    dto: UpdateLocationDto,
  ) {
    await this.assertLocationWorkConfiguration(
      currentUser.tenantId,
      dto.defaultWorkScheduleId,
      dto.holidayCalendarId,
    );
    const result = await this.organizationRepository.updateLocation(
      currentUser.tenantId,
      id,
      {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.code !== undefined
          ? { code: dto.code?.trim().toUpperCase() ?? null }
          : {}),
        ...(dto.addressLine1 !== undefined
          ? { addressLine1: dto.addressLine1?.trim() ?? null }
          : {}),
        ...(dto.addressLine2 !== undefined
          ? { addressLine2: dto.addressLine2?.trim() ?? null }
          : {}),
        ...(dto.city !== undefined ? { city: dto.city.trim() } : {}),
        ...(dto.state !== undefined ? { state: dto.state.trim() } : {}),
        ...(dto.country !== undefined ? { country: dto.country.trim() } : {}),
        ...(dto.zipCode !== undefined
          ? { zipCode: dto.zipCode?.trim() ?? null }
          : {}),
        ...(dto.timezone !== undefined
          ? { timezone: dto.timezone?.trim() ?? null }
          : {}),
        ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
        ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
        ...(dto.allowedRadiusMeters !== undefined
          ? { allowedRadiusMeters: dto.allowedRadiusMeters }
          : {}),
        /*
         * Attendance configuration.
         *
         * An explicit null is a real instruction here — it clears the work site
         * override so the tenant setting applies again — so null is written
         * through rather than coalesced away. Only `undefined` (the field was
         * not part of the request) leaves the stored value alone.
         */
        ...(dto.attendanceEnabled !== undefined
          ? { attendanceEnabled: dto.attendanceEnabled }
          : {}),
        ...(dto.maximumAccuracyMeters !== undefined
          ? { maximumAccuracyMeters: dto.maximumAccuracyMeters }
          : {}),
        ...(dto.allowedAttendanceMethods !== undefined
          ? { allowedAttendanceMethods: dto.allowedAttendanceMethods }
          : {}),
        ...(dto.webAttendancePolicy !== undefined
          ? { webAttendancePolicy: dto.webAttendancePolicy }
          : {}),
        ...(dto.devicePolicy !== undefined
          ? { devicePolicy: dto.devicePolicy }
          : {}),
        ...(dto.webFallbackEnabled !== undefined
          ? { webFallbackEnabled: dto.webFallbackEnabled }
          : {}),
        ...(dto.validFrom !== undefined
          ? { validFrom: dto.validFrom ? new Date(dto.validFrom) : null }
          : {}),
        ...(dto.validTo !== undefined
          ? { validTo: dto.validTo ? new Date(dto.validTo) : null }
          : {}),
        ...(dto.defaultWorkScheduleId !== undefined
          ? { defaultWorkScheduleId: dto.defaultWorkScheduleId ?? null }
          : {}),
        ...(dto.holidayCalendarId !== undefined
          ? { holidayCalendarId: dto.holidayCalendarId ?? null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedById: currentUser.userId,
      },
    );

    if (result.count === 0) {
      throw new NotFoundException('Location was not found for this tenant.');
    }

    return this.findLocationById(currentUser.tenantId, id);
  }

  private async assertLocationWorkConfiguration(
    tenantId: string,
    defaultWorkScheduleId?: string,
    holidayCalendarId?: string,
  ) {
    const [schedule, calendar] = await Promise.all([
      defaultWorkScheduleId
        ? this.prisma.workSchedule.findFirst({
            where: {
              id: defaultWorkScheduleId,
              tenantId,
              isActive: true,
              status: 'ACTIVE',
            },
            select: { id: true },
          })
        : null,
      holidayCalendarId
        ? this.prisma.holidayCalendar.findFirst({
            where: { id: holidayCalendarId, tenantId, status: 'ACTIVE' },
            select: { id: true },
          })
        : null,
    ]);
    if (defaultWorkScheduleId && !schedule) {
      throw new BadRequestException(
        'Selected default work schedule is not active for this tenant.',
      );
    }
    if (holidayCalendarId && !calendar) {
      throw new BadRequestException(
        'Selected work calendar is not active for this tenant.',
      );
    }
  }

  private async resolveRecordOwnerId(
    currentUser: AuthenticatedUser,
    requestedOwnerUserId?: string | null,
  ) {
    if (requestedOwnerUserId) {
      await this.assertUserInTenant(
        currentUser.tenantId,
        requestedOwnerUserId,
        'Record owner',
      );
      return requestedOwnerUserId;
    }

    if (currentUser.userId) return currentUser.userId;

    const serviceAccount = await this.prisma.user.findFirst({
      where: { tenantId: currentUser.tenantId, isServiceAccount: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (serviceAccount) return serviceAccount.id;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: currentUser.tenantId },
      select: { ownerUserId: true },
    });

    if (tenant?.ownerUserId) {
      const tenantOwner = await this.prisma.user.findFirst({
        where: { id: tenant.ownerUserId, tenantId: currentUser.tenantId },
        select: { id: true },
      });
      if (tenantOwner) return tenantOwner.id;
    }

    return null;
  }

  private async assertUserInTenant(
    tenantId: string,
    userId: string | null | undefined,
    label: string,
  ) {
    if (!userId) return;
    const user = await this.prisma.user.findFirst({
      where: { tenantId, id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException(`${label} must belong to this tenant.`);
    }
  }

  private async assertEmployeeInTenant(
    tenantId: string,
    employeeId: string | null | undefined,
    label: string,
  ) {
    if (!employeeId) return;
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId, id: employeeId, isDeleted: false },
      select: { id: true },
    });
    if (!employee) {
      throw new BadRequestException(`${label} must belong to this tenant.`);
    }
  }

  private async assertOrganizationCanDeactivate(tenantId: string, id: string) {
    const [childCount, businessUnitCount, employeeCount] = await Promise.all([
      this.organizationRepository.countOrganizationChildren(tenantId, id),
      this.organizationRepository.countOrganizationBusinessUnits(tenantId, id),
      this.prisma.employee.count({
        where: { tenantId, organizationId: id, isDeleted: false },
      }),
    ]);

    if (childCount > 0 || businessUnitCount > 0 || employeeCount > 0) {
      throw new ConflictException(
        'Organization cannot be deactivated while active child organizations, business units, or employees reference it.',
      );
    }
  }

  private async assertBusinessUnitCanDeactivate(tenantId: string, id: string) {
    const [childCount, departmentCount, teamCount, employeeCount] =
      await Promise.all([
        this.organizationRepository.countBusinessUnitChildren(tenantId, id),
        this.organizationRepository.countBusinessUnitDepartments(tenantId, id),
        this.organizationRepository.countBusinessUnitTeams(tenantId, id),
        this.organizationRepository.countBusinessUnitEmployees(tenantId, id),
      ]);

    if (
      childCount > 0 ||
      departmentCount > 0 ||
      teamCount > 0 ||
      employeeCount > 0
    ) {
      throw new ConflictException(
        'Business unit cannot be deactivated while active child business units, departments, teams, or employees reference it.',
      );
    }
  }

  private async assertDepartmentCanDeactivate(tenantId: string, id: string) {
    const [teamCount, employeeCount] = await Promise.all([
      this.organizationRepository.countDepartmentTeams(tenantId, id),
      this.organizationRepository.countDepartmentEmployees(tenantId, id),
    ]);

    if (teamCount > 0 || employeeCount > 0) {
      throw new ConflictException(
        'Department cannot be deactivated while active teams or employees reference it.',
      );
    }
  }

  private handleUniqueError(error: unknown, entityLabel: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        `${entityLabel} name or code is already in use for this tenant.`,
      );
    }

    throw error;
  }

  private async assertOrganizationParentValid(
    tenantId: string,
    organizationId: string | null,
    parentOrganizationId: string | null | undefined,
  ) {
    if (parentOrganizationId === undefined || parentOrganizationId === null) {
      return;
    }

    if (organizationId && parentOrganizationId === organizationId) {
      throw new BadRequestException(
        'Organization cannot be its own parent organization.',
      );
    }

    const parent = await this.organizationRepository.findOrganizationById(
      tenantId,
      parentOrganizationId,
    );
    if (!parent) {
      throw new BadRequestException(
        'Parent organization must belong to the same tenant.',
      );
    }

    if (!organizationId) {
      return;
    }

    const organizations =
      await this.organizationRepository.findOrganizations(tenantId);
    const parentChain = this.fetchParentOrganizationChainFromFlat(
      organizations,
      parentOrganizationId,
    );

    if (parentChain.some((item) => item.id === organizationId)) {
      throw new BadRequestException(
        'Circular organization hierarchy is not allowed.',
      );
    }
  }

  private async assertBusinessUnitParentValid(
    tenantId: string,
    businessUnitId: string | null,
    parentBusinessUnitId: string | null | undefined,
    organizationId: string,
  ) {
    if (parentBusinessUnitId === undefined || parentBusinessUnitId === null) {
      return;
    }

    if (businessUnitId && parentBusinessUnitId === businessUnitId) {
      throw new BadRequestException('Business unit cannot be its own parent.');
    }

    const parent = await this.organizationRepository.findBusinessUnitById(
      tenantId,
      parentBusinessUnitId,
    );
    if (!parent) {
      throw new BadRequestException(
        'Parent business unit must belong to the same tenant.',
      );
    }

    if (parent.organizationId !== organizationId) {
      throw new BadRequestException(
        'Parent business unit must belong to the same organization.',
      );
    }

    if (!businessUnitId) {
      return;
    }

    const businessUnits =
      await this.organizationRepository.findBusinessUnits(tenantId);
    const parentChain = this.fetchParentBusinessUnitChainFromFlat(
      businessUnits,
      parentBusinessUnitId,
    );

    if (parentChain.some((item) => item.id === businessUnitId)) {
      throw new BadRequestException(
        'Circular business unit hierarchy is not allowed.',
      );
    }
  }

  private fetchParentOrganizationChainFromFlat(
    organizations: Array<{
      id: string;
      parentOrganizationId: string | null;
    }>,
    organizationId: string,
  ) {
    const byId = new Map(organizations.map((item) => [item.id, item]));
    const chain: typeof organizations = [];
    let cursor = byId.get(organizationId);
    const seen = new Set<string>();

    while (cursor?.parentOrganizationId) {
      if (seen.has(cursor.parentOrganizationId)) {
        break;
      }
      seen.add(cursor.parentOrganizationId);
      const parent = byId.get(cursor.parentOrganizationId);
      if (!parent) {
        break;
      }
      chain.push(parent);
      cursor = parent;
    }

    return chain;
  }

  private fetchParentBusinessUnitChainFromFlat(
    businessUnits: Array<{
      id: string;
      parentBusinessUnitId: string | null;
    }>,
    businessUnitId: string,
  ) {
    const byId = new Map(businessUnits.map((item) => [item.id, item]));
    const chain: typeof businessUnits = [];
    let cursor = byId.get(businessUnitId);
    const seen = new Set<string>();

    while (cursor?.parentBusinessUnitId) {
      if (seen.has(cursor.parentBusinessUnitId)) {
        break;
      }
      seen.add(cursor.parentBusinessUnitId);
      const parent = byId.get(cursor.parentBusinessUnitId);
      if (!parent) {
        break;
      }
      chain.push(parent);
      cursor = parent;
    }

    return chain;
  }

  private buildOrganizationTree(
    organizations: Array<{
      id: string;
      tenantId: string;
      name: string;
      parentOrganizationId: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>,
  ) {
    const byParent = organizations.reduce<Record<string, typeof organizations>>(
      (acc, organization) => {
        const key = organization.parentOrganizationId ?? 'root';
        acc[key] = acc[key] ?? [];
        acc[key].push(organization);
        return acc;
      },
      {},
    );

    const build = (parentId: string | null): OrganizationNode[] => {
      const key = parentId ?? 'root';
      const children = byParent[key] ?? [];
      return children.map((organization) => ({
        ...organization,
        children: build(organization.id),
      }));
    };

    return build(null);
  }

  private buildBusinessUnitTree(
    businessUnits: Array<{
      id: string;
      tenantId: string;
      name: string;
      organizationId: string;
      parentBusinessUnitId: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>,
  ) {
    const byParent = businessUnits.reduce<Record<string, typeof businessUnits>>(
      (acc, businessUnit) => {
        const key = businessUnit.parentBusinessUnitId ?? 'root';
        acc[key] = acc[key] ?? [];
        acc[key].push(businessUnit);
        return acc;
      },
      {},
    );

    const build = (parentId: string | null): BusinessUnitNode[] => {
      const key = parentId ?? 'root';
      const children = byParent[key] ?? [];
      return children.map((businessUnit) => ({
        ...businessUnit,
        children: build(businessUnit.id),
      }));
    };

    return build(null);
  }

  private findOrganizationNode(
    tree: OrganizationNode[],
    id: string,
  ): OrganizationNode | null {
    for (const node of tree) {
      if (node.id === id) {
        return node;
      }
      const childMatch = this.findOrganizationNode(node.children, id);
      if (childMatch) {
        return childMatch;
      }
    }
    return null;
  }

  private findBusinessUnitNode(
    tree: BusinessUnitNode[],
    id: string,
  ): BusinessUnitNode | null {
    for (const node of tree) {
      if (node.id === id) {
        return node;
      }
      const childMatch = this.findBusinessUnitNode(node.children, id);
      if (childMatch) {
        return childMatch;
      }
    }
    return null;
  }
}

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function integrationIdentifier(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function normalizeSubStatus(status: string, subStatus: string | undefined) {
  const activeValues = new Set([
    'OPERATIONAL',
    'UNDER_SETUP',
    'PENDING_ACTIVATION',
  ]);
  const inactiveValues = new Set([
    'DEACTIVATED',
    'ARCHIVED',
    'MERGED',
    'CLOSED',
  ]);
  const normalizedStatus = status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
  const normalizedSubStatus = subStatus?.trim().toUpperCase();

  if (
    normalizedStatus === 'ACTIVE' &&
    normalizedSubStatus &&
    activeValues.has(normalizedSubStatus)
  ) {
    return normalizedSubStatus;
  }

  if (
    normalizedStatus === 'INACTIVE' &&
    normalizedSubStatus &&
    inactiveValues.has(normalizedSubStatus)
  ) {
    return normalizedSubStatus;
  }

  return normalizedStatus === 'ACTIVE' ? 'OPERATIONAL' : 'DEACTIVATED';
}

function archivedDesignationName(name: string, id: string) {
  const suffix = ` [deleted ${id.slice(0, 8)}]`;
  const base = name.trim() || 'Designation';
  return `${base.slice(0, Math.max(1, 100 - suffix.length))}${suffix}`;
}
