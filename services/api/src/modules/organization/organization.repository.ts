import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ListMasterDataDto } from './dto/list-master-data.dto';

type PrismaDb = PrismaService | Prisma.TransactionClient;

@Injectable()
export class OrganizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOrganizations(tenantId: string, db: PrismaDb = this.prisma) {
    return db.organization.findMany({
      where: { tenantId },
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

  findBusinessUnits(tenantId: string, db: PrismaDb = this.prisma) {
    return db.businessUnit.findMany({
      where: { tenantId },
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
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  findDepartmentById(tenantId: string, id: string, db: PrismaDb = this.prisma) {
    return db.department.findFirst({ where: { tenantId, id } });
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
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  findDesignationById(
    tenantId: string,
    id: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.designation.findFirst({ where: { tenantId, id } });
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
    OR?: Array<Record<string, { contains: string; mode: Prisma.QueryMode }>>;
  } = { tenantId };

  if (query.isActive !== undefined) {
    where.isActive = query.isActive;
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
