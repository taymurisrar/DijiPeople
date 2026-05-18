import { Injectable } from '@nestjs/common';
import { Prisma, SecurityPrivilege } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import {
  canEditEmployeeCoreProfile,
  hasElevatedTenantRole,
} from '../../common/security/elevated-tenant-roles';
import { buildScopedAccessWhere } from '../../common/security/rbac-query-scope';
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

    if (!employee) {
      return scopedAccess;
    }

    // A line manager can read their own profile and direct reports, but this
    // deliberately does not grant write/manage powers.
    return {
      OR: [
        scopedAccess,
        { userId: user.userId },
        { managerEmployeeId: employee.id },
      ],
    };
  }

  async canViewEmployeeRecord(user: AuthenticatedUser, employeeId: string) {
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

    const canManage = user.permissionKeys.includes('employees.update');
    if (canManage) {
      return 'HR_MANAGE';
    }

    if (!currentEmployee) return 'DENIED';

    if (target.managerEmployeeId === currentEmployee.id) {
      return 'MANAGER_READONLY';
    }

    return 'DENIED';
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

  async canUploadEmployeeDocument(
    user: AuthenticatedUser,
    employeeId: string,
  ) {
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
