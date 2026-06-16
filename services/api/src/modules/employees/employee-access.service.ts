import { Injectable } from '@nestjs/common';
import { Prisma, SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { ENTITY_KEYS, ROLE_KEYS } from '../../common/constants/rbac-matrix';
import {
  canEditEmployeeCoreProfile,
  hasElevatedTenantRole,
} from '../../common/security/elevated-tenant-roles';
import {
  buildScopedAccessWhere,
  resolveEffectiveAccessLevel,
} from '../../common/security/rbac-query-scope';
import { EmployeesRepository } from './employees.repository';

@Injectable()
export class EmployeeAccessService {
  constructor(private readonly employeesRepository: EmployeesRepository) {}

  async getCurrentEmployee(user: AuthenticatedUser) {
    return this.employeesRepository.findByUserIdAndTenant(
      user.tenantId,
      user.userId,
    );
  }

  async getCurrentEmployeeContext(user: AuthenticatedUser) {
    const employee = await this.getCurrentEmployee(user);
    if (!employee) {
      return { employee: null, isReportingManager: false };
    }

    const directReports = await this.employeesRepository.findDirectReports(
      user.tenantId,
      employee.id,
    );

    return {
      employee,
      isReportingManager: directReports.length > 0,
    };
  }

  async buildReadableEmployeeWhere(
    user: AuthenticatedUser,
  ): Promise<Prisma.EmployeeWhereInput> {
    const employee = await this.getCurrentEmployee(user);
    const accessLevel = resolveEffectiveAccessLevel(
      user,
      ENTITY_KEYS.EMPLOYEES,
      SecurityPrivilege.READ,
    );
    const scopedAccess = buildScopedAccessWhere<Prisma.EmployeeWhereInput>(
      user,
      ENTITY_KEYS.EMPLOYEES,
      SecurityPrivilege.READ,
      {
        organizationIdField: null,
        userIdField: 'userId',
      },
    );

    if (hasElevatedTenantRole(user)) {
      return scopedAccess;
    }

    if (
      !this.isManagerHierarchyScoped(user) &&
      accessLevel !== SecurityAccessLevel.NONE &&
      accessLevel !== SecurityAccessLevel.SELF &&
      accessLevel !== SecurityAccessLevel.USER
    ) {
      return scopedAccess;
    }

    if (!employee) {
      return scopedAccess;
    }

    const reporteeIds = await this.resolveReportingHierarchyEmployeeIds(
      user.tenantId,
      employee.id,
    );
    if (reporteeIds.length > 0) {
      // The Employees module is the manager's team surface. Their own record
      // remains available through My Profile and the record-level access check.
      return { id: { in: reporteeIds } };
    }

    return {
      OR: [scopedAccess, { userId: user.userId }],
    };
  }

  async canViewEmployeeRecord(user: AuthenticatedUser, employeeId: string) {
    const currentEmployee = await this.getCurrentEmployee(user);
    if (currentEmployee?.id === employeeId) {
      return true;
    }

    const employee = await this.employeesRepository.findByIdAndTenant(
      user.tenantId,
      employeeId,
      await this.buildReadableEmployeeWhere(user),
    );

    return Boolean(employee);
  }

  async getEmployeeRecordAccess(
    user: AuthenticatedUser,
    employeeId: string,
  ): Promise<
    'SELF' | 'MANAGER_READONLY' | 'HR_MANAGE' | 'ADMIN_MANAGE' | 'DENIED'
  > {
    const target = await this.employeesRepository.findByIdAndTenant(
      user.tenantId,
      employeeId,
    );
    if (!target) return 'DENIED';

    if (hasElevatedTenantRole(user)) {
      return 'ADMIN_MANAGE';
    }

    const currentEmployee = await this.getCurrentEmployee(user);
    if (currentEmployee?.id === target.id) {
      return 'SELF';
    }

    const canManage =
      canEditEmployeeCoreProfile(user) &&
      user.permissionKeys.includes('employees.update');
    if (canManage) {
      return 'HR_MANAGE';
    }

    const readableEmployee = await this.employeesRepository.findByIdAndTenant(
      user.tenantId,
      employeeId,
      await this.buildReadableEmployeeWhere(user),
    );
    if (readableEmployee) {
      return 'MANAGER_READONLY';
    }

    if (!currentEmployee) return 'DENIED';

    return 'DENIED';
  }

  private async resolveReportingHierarchyEmployeeIds(
    tenantId: string,
    managerEmployeeId: string,
  ) {
    const hierarchyIds = new Set<string>();
    let frontier = [managerEmployeeId];

    while (frontier.length > 0) {
      const nextFrontier: string[] = [];

      for (const currentManagerEmployeeId of frontier) {
        const directReports = await this.employeesRepository.findDirectReports(
          tenantId,
          currentManagerEmployeeId,
        );

        for (const employee of directReports) {
          if (!hierarchyIds.has(employee.id)) {
            hierarchyIds.add(employee.id);
            nextFrontier.push(employee.id);
          }
        }
      }

      frontier = nextFrontier;
    }

    return Array.from(hierarchyIds);
  }

  private isManagerHierarchyScoped(user: AuthenticatedUser) {
    const roleKeys = user.roleKeys ?? [];

    return (
      roleKeys.includes(ROLE_KEYS.MANAGER) &&
      !roleKeys.includes(ROLE_KEYS.CEO) &&
      !roleKeys.includes(ROLE_KEYS.HR) &&
      !hasElevatedTenantRole(user)
    );
  }

  async canWriteEmployeeRecord(user: AuthenticatedUser, employeeId: string) {
    const accessMode = await this.getEmployeeRecordAccess(user, employeeId);
    if (accessMode === 'ADMIN_MANAGE' || accessMode === 'HR_MANAGE') {
      return true;
    }

    return (
      accessMode === 'SELF' &&
      user.permissionKeys.includes('employees.update.self')
    );
  }

  canEditEmployeeCoreProfile(user: AuthenticatedUser) {
    return canEditEmployeeCoreProfile(user);
  }

  async canUploadEmployeeProfileImage(
    user: AuthenticatedUser,
    employeeId: string,
  ) {
    const accessMode = await this.getEmployeeRecordAccess(user, employeeId);
    if (accessMode === 'SELF') return true;
    if (accessMode === 'ADMIN_MANAGE' || accessMode === 'HR_MANAGE') {
      return user.permissionKeys.includes('employees.documents.upload');
    }

    return false;
  }

  async canUploadEmployeeDocument(user: AuthenticatedUser, employeeId: string) {
    const accessMode = await this.getEmployeeRecordAccess(user, employeeId);
    if (accessMode === 'SELF') {
      // Own profile documents are baseline self-service profile data. The
      // tenant-scoped SELF check above is the authorization boundary here.
      return true;
    }
    if (accessMode === 'ADMIN_MANAGE' || accessMode === 'HR_MANAGE') {
      return user.permissionKeys.includes('employees.documents.upload');
    }

    return false;
  }

  async canReadEmployeeDocument(user: AuthenticatedUser, employeeId: string) {
    const accessMode = await this.getEmployeeRecordAccess(user, employeeId);
    if (accessMode === 'SELF') return true;
    if (accessMode === 'ADMIN_MANAGE' || accessMode === 'HR_MANAGE') {
      return user.permissionKeys.includes('employees.documents.read');
    }

    return accessMode === 'MANAGER_READONLY';
  }
}
