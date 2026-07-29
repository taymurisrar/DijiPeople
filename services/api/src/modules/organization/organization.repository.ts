import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ListMasterDataDto } from './dto/list-master-data.dto';

type PrismaDb = PrismaService | Prisma.TransactionClient;

const peopleLookupSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} satisfies Prisma.UserSelect;

const employeeLookupSelect = {
  id: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
  email: true,
} satisfies Prisma.EmployeeSelect;

@Injectable()
export class OrganizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOrganizations(tenantId: string, db: PrismaDb = this.prisma) {
    return db.organization.findMany({
      where: { tenantId },
      include: {
        parentOrganization: { select: { id: true, name: true } },
        headEmployee: { select: employeeLookupSelect },
        ownerUser: { select: peopleLookupSelect },
        createdBy: { select: peopleLookupSelect },
        updatedBy: { select: peopleLookupSelect },
      },
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
    });
  }

  findOrganizationById(
    tenantId: string,
    id: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.organization.findFirst({
      where: { tenantId, id },
      include: {
        parentOrganization: { select: { id: true, name: true } },
        headEmployee: { select: employeeLookupSelect },
        ownerUser: { select: peopleLookupSelect },
        createdBy: { select: peopleLookupSelect },
        updatedBy: { select: peopleLookupSelect },
      },
    });
  }

  createOrganization(
    data: Prisma.OrganizationUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.organization.create({ data });
  }

  updateOrganization(
    tenantId: string,
    id: string,
    data: Prisma.OrganizationUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.organization.updateMany({
      where: { tenantId, id },
      data,
    });
  }

  deleteOrganization(tenantId: string, id: string, db: PrismaDb = this.prisma) {
    return db.organization.deleteMany({
      where: { tenantId, id },
    });
  }

  countOrganizationChildren(
    tenantId: string,
    id: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.organization.count({
      where: { tenantId, parentOrganizationId: id },
    });
  }

  countOrganizationBusinessUnits(
    tenantId: string,
    id: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.businessUnit.count({
      where: { tenantId, organizationId: id },
    });
  }

  findBusinessUnits(
    tenantId: string,
    query: Pick<
      ListMasterDataDto,
      'organizationId' | 'businessUnitId' | 'isActive'
    > = {},
    db: PrismaDb = this.prisma,
  ) {
    return db.businessUnit.findMany({
      where: {
        tenantId,
        ...(query.organizationId
          ? { organizationId: query.organizationId }
          : {}),
        ...(query.businessUnitId
          ? { parentBusinessUnitId: query.businessUnitId }
          : {}),
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      },
      include: {
        organization: { select: { id: true, name: true } },
        parentBusinessUnit: { select: { id: true, name: true } },
        headEmployee: { select: employeeLookupSelect },
        ownerUser: { select: peopleLookupSelect },
        createdBy: { select: peopleLookupSelect },
        updatedBy: { select: peopleLookupSelect },
      },
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
    });
  }

  findBusinessUnitById(
    tenantId: string,
    id: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.businessUnit.findFirst({
      where: { tenantId, id },
      include: {
        organization: { select: { id: true, name: true } },
        parentBusinessUnit: { select: { id: true, name: true } },
        headEmployee: { select: employeeLookupSelect },
        ownerUser: { select: peopleLookupSelect },
        createdBy: { select: peopleLookupSelect },
        updatedBy: { select: peopleLookupSelect },
      },
    });
  }

  createBusinessUnit(
    data: Prisma.BusinessUnitUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.businessUnit.create({ data });
  }

  updateBusinessUnit(
    tenantId: string,
    id: string,
    data: Prisma.BusinessUnitUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.businessUnit.updateMany({
      where: { tenantId, id },
      data,
    });
  }

  deleteBusinessUnit(tenantId: string, id: string, db: PrismaDb = this.prisma) {
    return db.businessUnit.deleteMany({
      where: { tenantId, id },
    });
  }

  countBusinessUnitChildren(
    tenantId: string,
    id: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.businessUnit.count({
      where: { tenantId, parentBusinessUnitId: id },
    });
  }

  countBusinessUnitUsers(
    tenantId: string,
    id: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.user.count({
      where: { tenantId, businessUnitId: id },
    });
  }

  countBusinessUnitDepartments(
    tenantId: string,
    id: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.department.count({
      where: { tenantId, businessUnitId: id },
    });
  }

  countBusinessUnitEmployees(
    tenantId: string,
    id: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.employee.count({
      where: { tenantId, businessUnitId: id, isDeleted: false },
    });
  }

  countBusinessUnitTeams(
    tenantId: string,
    id: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.team.count({
      where: { tenantId, businessUnitId: id, isActive: true },
    });
  }

  countDepartmentTeams(
    tenantId: string,
    id: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.team.count({
      where: { tenantId, departmentId: id, isActive: true },
    });
  }

  countDepartmentEmployees(
    tenantId: string,
    id: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.employee.count({
      where: { tenantId, departmentId: id, isDeleted: false },
    });
  }

  findDepartments(
    tenantId: string,
    query: ListMasterDataDto,
    db: PrismaDb = this.prisma,
  ) {
    return db.department.findMany({
      where: buildMasterDataWhere(tenantId, query, [
        'name',
        'code',
        'description',
      ]),
      include: {
        businessUnit: {
          select: { id: true, name: true, organizationId: true },
        },
        headEmployee: { select: employeeLookupSelect },
        ownerUser: { select: peopleLookupSelect },
        createdBy: { select: peopleLookupSelect },
        updatedBy: { select: peopleLookupSelect },
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  findDepartmentById(tenantId: string, id: string, db: PrismaDb = this.prisma) {
    return db.department.findFirst({
      where: { tenantId, id },
      include: {
        businessUnit: {
          select: { id: true, name: true, organizationId: true },
        },
        headEmployee: { select: employeeLookupSelect },
        ownerUser: { select: peopleLookupSelect },
        createdBy: { select: peopleLookupSelect },
        updatedBy: { select: peopleLookupSelect },
      },
    });
  }

  createDepartment(
    data: Prisma.DepartmentUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.department.create({ data });
  }

  updateDepartment(
    tenantId: string,
    id: string,
    data: Prisma.DepartmentUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.department.updateMany({ where: { tenantId, id }, data });
  }

  findDesignations(
    tenantId: string,
    query: ListMasterDataDto,
    db: PrismaDb = this.prisma,
  ) {
    return db.designation.findMany({
      where: buildMasterDataWhere(tenantId, query, [
        'name',
        'level',
        'description',
      ]),
      include: {
        employeeLevel: {
          select: {
            id: true,
            code: true,
            name: true,
            rank: true,
            isActive: true,
          },
        },
        _count: { select: { employees: true } },
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  findDesignationById(
    tenantId: string,
    id: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.designation.findFirst({
      where: { tenantId, id },
      include: {
        employeeLevel: {
          select: {
            id: true,
            code: true,
            name: true,
            rank: true,
            isActive: true,
          },
        },
        _count: { select: { employees: true } },
      },
    });
  }

  createDesignation(
    data: Prisma.DesignationUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.designation.create({ data });
  }

  updateDesignation(
    tenantId: string,
    id: string,
    data: Prisma.DesignationUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.designation.updateMany({ where: { tenantId, id }, data });
  }

  findLocations(
    tenantId: string,
    query: ListMasterDataDto,
    db: PrismaDb = this.prisma,
  ) {
    return db.location.findMany({
      where: buildMasterDataWhere(tenantId, query, [
        'name',
        'code',
        'city',
        'state',
        'country',
        'timezone',
      ]),
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  findLocationById(tenantId: string, id: string, db: PrismaDb = this.prisma) {
    return db.location.findFirst({ where: { tenantId, id } });
  }

  createLocation(
    data: Prisma.LocationUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.location.create({ data });
  }

  updateLocation(
    tenantId: string,
    id: string,
    data: Prisma.LocationUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.location.updateMany({ where: { tenantId, id }, data });
  }
}

function buildMasterDataWhere(
  tenantId: string,
  query: ListMasterDataDto,
  fields: string[],
) {
  const where: {
    tenantId: string;
    isActive?: boolean;
    businessUnitId?: string;
    OR?: Array<Record<string, { contains: string; mode: Prisma.QueryMode }>>;
  } = { tenantId };

  if (query.isActive !== undefined) {
    where.isActive = query.isActive;
  }

  if (query.businessUnitId) {
    where.businessUnitId = query.businessUnitId;
  }

  if (query.search?.trim()) {
    const search = query.search.trim();
    where.OR = fields.map((field) => ({
      [field]: {
        contains: search,
        mode: 'insensitive',
      },
    }));
  }

  return where;
}
