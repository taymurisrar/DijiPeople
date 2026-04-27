import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { CreateDesignationDto } from './dto/create-designation.dto';
import { CreateLocationDto } from './dto/create-location.dto';
import { ListMasterDataDto } from './dto/list-master-data.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { UpdateDesignationDto } from './dto/update-designation.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { OrganizationRepository } from './organization.repository';

@Injectable()
export class OrganizationService {
  constructor(private readonly organizationRepository: OrganizationRepository) {}

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

  async createDepartment(currentUser: AuthenticatedUser, dto: CreateDepartmentDto) {
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

  async createDesignation(currentUser: AuthenticatedUser, dto: CreateDesignationDto) {
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
        ...(dto.level !== undefined ? { level: dto.level?.trim() ?? null } : {}),
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
}
