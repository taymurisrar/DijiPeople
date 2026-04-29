import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
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
  createdAt: Date;
  updatedAt: Date;
  children: BusinessUnitNode[];
};

@Injectable()
export class OrganizationService {
  constructor(
    private readonly organizationRepository: OrganizationRepository,
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
      return await this.organizationRepository.createOrganization({
        tenantId: currentUser.tenantId,
        name: dto.name.trim(),
        parentOrganizationId: dto.parentOrganizationId ?? null,
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
    await this.findOrganizationById(currentUser.tenantId, id);

    if (dto.parentOrganizationId !== undefined) {
      await this.assertOrganizationParentValid(
        currentUser.tenantId,
        id,
        dto.parentOrganizationId,
      );
    }

    try {
      const result = await this.organizationRepository.updateOrganization(
        currentUser.tenantId,
        id,
        {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.parentOrganizationId !== undefined
            ? { parentOrganizationId: dto.parentOrganizationId ?? null }
            : {}),
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

    const [childCount, businessUnitCount] = await Promise.all([
      this.organizationRepository.countOrganizationChildren(
        currentUser.tenantId,
        id,
      ),
      this.organizationRepository.countOrganizationBusinessUnits(
        currentUser.tenantId,
        id,
      ),
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

    await this.organizationRepository.deleteOrganization(
      currentUser.tenantId,
      id,
    );
    return { deleted: true, id };
  }

  findBusinessUnits(tenantId: string) {
    return this.organizationRepository.findBusinessUnits(tenantId);
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
      return await this.organizationRepository.createBusinessUnit({
        tenantId: currentUser.tenantId,
        name: dto.name.trim(),
        organizationId: dto.organizationId,
        parentBusinessUnitId: dto.parentBusinessUnitId ?? null,
        type: dto.type ?? 'INTERNAL',
        settingsJson: dto.settingsJson as Prisma.InputJsonValue | undefined,
        payrollContactName: dto.payrollContactName?.trim(),
        payrollContactEmail: dto.payrollContactEmail?.trim().toLowerCase(),
        payrollContactPhone: dto.payrollContactPhone?.trim(),
        approvalContactName: dto.approvalContactName?.trim(),
        approvalContactEmail: dto.approvalContactEmail?.trim().toLowerCase(),
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

    const [childCount, userCount] = await Promise.all([
      this.organizationRepository.countBusinessUnitChildren(
        currentUser.tenantId,
        id,
      ),
      this.organizationRepository.countBusinessUnitUsers(
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

    await this.organizationRepository.deleteBusinessUnit(
      currentUser.tenantId,
      id,
    );
    return { deleted: true, id };
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
    const [organizations, businessUnits] = await Promise.all([
      this.organizationRepository.findOrganizations(tenantId),
      this.organizationRepository.findBusinessUnits(tenantId),
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

    return {
      organizations: organizationTree,
      businessUnitsByOrganization: businessUnitTreeByOrganization,
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
    try {
      return await this.organizationRepository.createDepartment({
        tenantId: currentUser.tenantId,
        name: dto.name.trim(),
        code: dto.code?.trim().toUpperCase(),
        description: dto.description?.trim(),
        isActive: dto.isActive ?? true,
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
    const result = await this.organizationRepository.updateDepartment(
      currentUser.tenantId,
      id,
      {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.code !== undefined
          ? { code: dto.code?.trim().toUpperCase() ?? null }
          : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() ?? null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
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
    try {
      return await this.organizationRepository.createDesignation({
        tenantId: currentUser.tenantId,
        name: dto.name.trim(),
        level: dto.level?.trim(),
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
    const result = await this.organizationRepository.updateDesignation(
      currentUser.tenantId,
      id,
      {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.level !== undefined
          ? { level: dto.level?.trim() ?? null }
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
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedById: currentUser.userId,
      },
    );

    if (result.count === 0) {
      throw new NotFoundException('Location was not found for this tenant.');
    }

    return this.findLocationById(currentUser.tenantId, id);
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
