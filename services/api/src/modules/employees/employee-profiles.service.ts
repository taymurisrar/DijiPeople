import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { getAppOrigin } from '@repo/config';
import { extname } from 'path';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  Prisma,
  SecurityAccessLevel,
  SecurityPrivilege,
} from '@prisma/client';
import { normalizeEmail } from '../../common/utils/email.util';
import { getAccessTokenSecret } from '../../common/config/auth.config';
import { PERMISSION_KEYS } from '../../common/constants/permissions';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { resolveEffectiveAccessLevel } from '../../common/security/rbac-query-scope';
import { canManageEmployeeAccountActions } from '../../common/security/employee-account-actions';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { DocumentsRepository } from '../documents/documents.repository';
import { EmailService } from '../notifications/email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TenantSettingsResolverService } from '../tenant-settings/tenant-settings-resolver.service';
import { EmployeesRepository } from './employees.repository';
import { EmployeeAccessService } from './employee-access.service';
import { CreateEmployeePreviousEmploymentDto } from './dto/create-employee-previous-employment.dto';
import { CreateEmployeeEducationDto } from './dto/create-employee-education.dto';
import { CreateEmployeeHistoryDto } from './dto/create-employee-history.dto';
import { EmployeeDocumentUploadDto } from './dto/employee-document-upload.dto';
import { UpdateEmployeePreviousEmploymentDto } from './dto/update-employee-previous-employment.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { UpdateEmergencyContactDto } from './dto/update-emergency-contact.dto';
import { UpdateEmployeeEducationDto } from './dto/update-employee-education.dto';
import { UpdatePersonalInfoDto } from './dto/update-personal-info.dto';
import { UpsertEmployeeCompensationDto } from './dto/upsert-employee-compensation.dto';

type UploadedFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

const ALLOWED_EMPLOYEE_DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
]);

const ALLOWED_PROFILE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/*
 * Named explicitly rather than letting findFirst return the whole row. The
 * model carries bank account number, IBAN, routing number and tax identifier,
 * so a column added to it later must be published deliberately rather than by
 * default.
 */
const employeeCompensationSelect = {
  id: true,
  tenantId: true,
  employeeId: true,
  basicSalary: true,
  payFrequency: true,
  effectiveDate: true,
  endDate: true,
  currency: true,
  payrollStatus: true,
  payrollGroup: true,
  paymentMode: true,
  bankName: true,
  bankAccountTitle: true,
  bankAccountNumber: true,
  bankIban: true,
  bankRoutingNumber: true,
  taxIdentifier: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.EmployeeCompensationSelect;

@Injectable()
export class EmployeeProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employeesRepository: EmployeesRepository,
    private readonly documentsRepository: DocumentsRepository,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
    private readonly tenantSettingsResolver: TenantSettingsResolverService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly employeeAccessService: EmployeeAccessService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getProfile(currentUser: AuthenticatedUser, employeeId: string) {
    const employee = await this.assertEmployeeAccess(currentUser, employeeId);
    const accessMode = await this.employeeAccessService.getEmployeeRecordAccess(
      currentUser,
      employeeId,
    );
    const [
      educationRecords,
      employeeHistory,
      leaveHistory,
      documents,
      previousEmployments,
      currentCompensation,
    ] = await Promise.all([
      this.listEducation(currentUser, employeeId),
      this.listHistory(currentUser, employeeId),
      this.listLeaveHistory(currentUser, employeeId),
      this.listEmployeeDocuments(currentUser, employeeId),
      this.listPreviousEmployments(currentUser, employeeId),
      this.getCurrentCompensation(currentUser, employeeId),
    ]);
    const fullName = [
      employee.firstName,
      employee.middleName,
      employee.lastName,
    ]
      .filter(Boolean)
      .join(' ');
    const profileImage = await this.buildProfileImageSummary(employee);

    return {
      id: employee.id,
      tenantId: employee.tenantId,
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      middleName: employee.middleName,
      lastName: employee.lastName,
      preferredName: employee.preferredName,
      fullName,
      profileImageDocumentId: employee.profileImageDocumentId,
      workEmail: employee.email,
      personalEmail: employee.personalEmail,
      phone: employee.phone,
      alternatePhone: employee.alternatePhone,
      dateOfBirth: employee.dateOfBirth,
      gender: employee.gender,
      maritalStatus: employee.maritalStatus,
      nationalityCountryId: employee.nationalityCountryId,
      nationality: employee.nationality,
      cnic: employee.cnic,
      bloodGroup: employee.bloodGroup,
      employmentStatus: employee.employmentStatus,
      employeeType: employee.employeeType,
      workMode: employee.workMode,
      contractType: employee.contractType,
      hireDate: employee.hireDate,
      confirmationDate: employee.confirmationDate,
      probationEndDate: employee.probationEndDate,
      terminationDate: employee.terminationDate,
      departmentId: employee.departmentId,
      teamId: employee.teamId,
      designationId: employee.designationId,
      employeeLevelId: employee.employeeLevelId,
      locationId: employee.locationId,
      defaultWorkScheduleId: employee.defaultWorkScheduleId,
      officialJoiningLocationId: employee.officialJoiningLocationId,
      managerEmployeeId: employee.managerEmployeeId,
      reportingManagerEmployeeId: employee.managerEmployeeId,
      userId: employee.userId,
      ownerUserId: employee.ownerUserId,
      addressLine1: employee.addressLine1,
      addressLine2: employee.addressLine2,
      countryId: employee.countryId,
      stateProvinceId: employee.stateProvinceId,
      cityId: employee.cityId,
      city: employee.cityLookup?.name ?? employee.city,
      stateProvince:
        employee.stateProvinceLookup?.name ?? employee.stateProvince,
      country: employee.countryLookup?.name ?? employee.country,
      postalCode: employee.postalCode,
      emergencyContactName: employee.emergencyContactName,
      emergencyContactRelationTypeId: employee.emergencyContactRelationTypeId,
      emergencyContactRelation: employee.emergencyContactRelation,
      emergencyContactPhone: employee.emergencyContactPhone,
      emergencyContactAlternatePhone: employee.emergencyContactAlternatePhone,
      noticePeriodDays: employee.noticePeriodDays,
      taxIdentifier: employee.taxIdentifier,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
      manager: employee.manager
        ? {
            id: employee.manager.id,
            employeeCode: employee.manager.employeeCode,
            firstName: employee.manager.firstName,
            lastName: employee.manager.lastName,
            preferredName: employee.manager.preferredName,
            fullName: `${employee.manager.firstName} ${employee.manager.lastName}`,
            employmentStatus: employee.manager.employmentStatus,
          }
        : null,
      reportingManager: employee.manager
        ? {
            id: employee.manager.id,
            employeeCode: employee.manager.employeeCode,
            firstName: employee.manager.firstName,
            lastName: employee.manager.lastName,
            preferredName: employee.manager.preferredName,
            fullName: `${employee.manager.firstName} ${employee.manager.lastName}`,
            employmentStatus: employee.manager.employmentStatus,
          }
        : null,
      user: employee.user ?? null,
      ownerUser: employee.ownerUser
        ? {
            id: employee.ownerUser.id,
            email: employee.ownerUser.email,
            firstName: employee.ownerUser.firstName,
            lastName: employee.ownerUser.lastName,
            fullName:
              `${employee.ownerUser.firstName} ${employee.ownerUser.lastName}`.trim(),
          }
        : null,
      department: employee.department,
      team: employee.team,
      designation: employee.designation,
      employeeLevel: employee.employeeLevel,
      location: employee.location,
      defaultWorkSchedule: employee.defaultWorkSchedule,
      officialJoiningLocation: employee.officialJoiningLocation,
      profileImage,
      basicProfile: {
        fullName,
        employeeCode: employee.employeeCode,
        designation: employee.designation?.name ?? null,
        employeeLevel: employee.employeeLevel?.name ?? null,
        department: employee.department?.name ?? null,
        managerName: employee.manager
          ? `${employee.manager.firstName} ${employee.manager.lastName}`
          : null,
        reportingManagerName: employee.manager
          ? `${employee.manager.firstName} ${employee.manager.lastName}`
          : null,
        employmentStatus: employee.employmentStatus,
        hireDate: employee.hireDate,
        workEmail: employee.email,
        phone: employee.phone,
      },
      personalInfo: {
        firstName: employee.firstName,
        middleName: employee.middleName,
        lastName: employee.lastName,
        preferredName: employee.preferredName,
        workEmail: employee.email,
        personalEmail: employee.personalEmail,
        phone: employee.phone,
        alternatePhone: employee.alternatePhone,
        dateOfBirth: employee.dateOfBirth,
        gender: employee.gender,
        maritalStatus: employee.maritalStatus,
        nationalityCountryId: employee.nationalityCountryId,
        nationality: employee.nationality,
        cnic: employee.cnic,
        bloodGroup: employee.bloodGroup,
      },
      employmentInfo: {
        employmentStatus: employee.employmentStatus,
        employeeType: employee.employeeType,
        workMode: employee.workMode,
        contractType: employee.contractType,
        hireDate: employee.hireDate,
        confirmationDate: employee.confirmationDate,
        probationEndDate: employee.probationEndDate,
        terminationDate: employee.terminationDate,
        department: employee.department,
        team: employee.team,
        designation: employee.designation,
        employeeLevel: employee.employeeLevel,
        location: employee.location,
        officialJoiningLocation: employee.officialJoiningLocation,
        noticePeriodDays: employee.noticePeriodDays,
        taxIdentifier: employee.taxIdentifier,
        manager: employee.manager
          ? {
              id: employee.manager.id,
              fullName: `${employee.manager.firstName} ${employee.manager.lastName}`,
            }
          : null,
        reportingManager: employee.manager
          ? {
              id: employee.manager.id,
              fullName: `${employee.manager.firstName} ${employee.manager.lastName}`,
            }
          : null,
      },
      addressInfo: {
        addressLine1: employee.addressLine1,
        addressLine2: employee.addressLine2,
        countryId: employee.countryId,
        stateProvinceId: employee.stateProvinceId,
        cityId: employee.cityId,
        city: employee.cityLookup?.name ?? employee.city,
        stateProvince:
          employee.stateProvinceLookup?.name ?? employee.stateProvince,
        country: employee.countryLookup?.name ?? employee.country,
        postalCode: employee.postalCode,
      },
      emergencyContact: {
        emergencyContactName: employee.emergencyContactName,
        emergencyContactRelationTypeId: employee.emergencyContactRelationTypeId,
        emergencyContactRelation: employee.emergencyContactRelation,
        emergencyContactPhone: employee.emergencyContactPhone,
        emergencyContactAlternatePhone: employee.emergencyContactAlternatePhone,
      },
      educationRecords,
      previousEmployments,
      currentCompensation,
      accessMode,
      employeeHistory,
      leaveHistory,
      documents,
      derivedStats: buildDerivedStats(employee.hireDate, employee.dateOfBirth),
      counts: {
        directReports: employee._count.directReports,
        educationRecords: employee._count.educationRecords,
        historyRecords: employee._count.historyRecords,
        documents: employee._count.documentLinks,
      },
    };
  }

  async updatePersonalInfo(
    currentUser: AuthenticatedUser,
    employeeId: string,
    dto: UpdatePersonalInfoDto,
  ) {
    const employee = await this.assertEmployeeExists(
      currentUser.tenantId,
      employeeId,
      await this.employeeAccessService.buildReadableEmployeeWhere(currentUser),
    );

    if (
      dto.workEmail !== undefined &&
      employee.user?.email &&
      dto.workEmail &&
      normalizeEmail(dto.workEmail) !== employee.user.email
    ) {
      throw new BadRequestException(
        'Work email must match the linked user authentication email.',
      );
    }

    if (dto.dateOfBirth && new Date(dto.dateOfBirth) > new Date()) {
      throw new BadRequestException('Date of birth cannot be in the future.');
    }

    let nationalityName: string | null | undefined;

    if (dto.nationalityCountryId !== undefined) {
      if (!dto.nationalityCountryId) {
        nationalityName = null;
      } else {
        const country = await this.prisma.country.findFirst({
          where: { id: dto.nationalityCountryId, isActive: true },
          select: { name: true },
        });

        if (!country) {
          throw new BadRequestException('Selected nationality is invalid.');
        }

        nationalityName = country.name;
      }
    }

    return this.updateEmployeeSection(
      currentUser,
      employeeId,
      {
        ...(dto.firstName !== undefined
          ? { firstName: dto.firstName.trim() }
          : {}),
        ...(dto.middleName !== undefined
          ? { middleName: dto.middleName?.trim() ?? null }
          : {}),
        ...(dto.lastName !== undefined
          ? { lastName: dto.lastName.trim() }
          : {}),
        ...(dto.preferredName !== undefined
          ? { preferredName: dto.preferredName?.trim() ?? null }
          : {}),
        ...(dto.workEmail !== undefined
          ? {
              email:
                employee.user?.email ??
                dto.workEmail?.trim().toLowerCase() ??
                null,
            }
          : {}),
        ...(dto.personalEmail !== undefined
          ? { personalEmail: dto.personalEmail?.trim().toLowerCase() ?? null }
          : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
        ...(dto.alternatePhone !== undefined
          ? { alternatePhone: dto.alternatePhone?.trim() ?? null }
          : {}),
        ...(dto.dateOfBirth !== undefined
          ? { dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null }
          : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender ?? null } : {}),
        ...(dto.maritalStatus !== undefined
          ? { maritalStatus: dto.maritalStatus ?? null }
          : {}),
        ...(dto.nationalityCountryId !== undefined
          ? { nationalityCountryId: dto.nationalityCountryId ?? null }
          : {}),
        ...(dto.nationality !== undefined ||
        dto.nationalityCountryId !== undefined
          ? { nationality: nationalityName ?? dto.nationality?.trim() ?? null }
          : {}),
        ...(dto.cnic !== undefined ? { cnic: dto.cnic?.trim() ?? null } : {}),
        ...(dto.bloodGroup !== undefined
          ? { bloodGroup: dto.bloodGroup?.trim().toUpperCase() ?? null }
          : {}),
      },
      'EMPLOYEE_PERSONAL_INFO_UPDATED',
    );
  }

  async updateAddress(
    currentUser: AuthenticatedUser,
    employeeId: string,
    dto: UpdateAddressDto,
  ) {
    const employee = await this.assertEmployeeWriteAccess(
      currentUser,
      employeeId,
    );
    const nextCountryId =
      dto.countryId !== undefined ? dto.countryId : employee.countryId;
    const nextStateProvinceId =
      dto.stateProvinceId !== undefined
        ? dto.stateProvinceId
        : employee.stateProvinceId;
    const nextCityId = dto.cityId !== undefined ? dto.cityId : employee.cityId;

    let countryName: string | null | undefined;
    let stateProvinceName: string | null | undefined;
    let cityName: string | null | undefined;

    if (nextCountryId) {
      const country = await this.prisma.country.findFirst({
        where: { id: nextCountryId, isActive: true },
        select: { id: true, name: true },
      });

      if (!country) {
        throw new BadRequestException('Selected country is invalid.');
      }

      countryName = country.name;
    }

    if (nextStateProvinceId) {
      const stateProvince = await this.prisma.stateProvince.findFirst({
        where: {
          id: nextStateProvinceId,
          isActive: true,
          ...(nextCountryId ? { countryId: nextCountryId } : {}),
        },
        select: { id: true, name: true },
      });

      if (!stateProvince) {
        throw new BadRequestException(
          'Selected state or province is invalid for the chosen country.',
        );
      }

      stateProvinceName = stateProvince.name;
    }

    if (nextCityId) {
      const city = await this.prisma.city.findFirst({
        where: {
          id: nextCityId,
          isActive: true,
          ...(nextCountryId ? { countryId: nextCountryId } : {}),
          ...(nextStateProvinceId
            ? { stateProvinceId: nextStateProvinceId }
            : {}),
        },
        select: { id: true, name: true },
      });

      if (!city) {
        throw new BadRequestException(
          'Selected city is invalid for the chosen state or country.',
        );
      }

      cityName = city.name;
    }

    return this.updateEmployeeSection(
      currentUser,
      employeeId,
      {
        ...(dto.addressLine1 !== undefined
          ? { addressLine1: dto.addressLine1?.trim() ?? null }
          : {}),
        ...(dto.addressLine2 !== undefined
          ? { addressLine2: dto.addressLine2?.trim() ?? null }
          : {}),
        ...(dto.countryId !== undefined
          ? { countryId: dto.countryId ?? null }
          : {}),
        ...(dto.stateProvinceId !== undefined
          ? { stateProvinceId: dto.stateProvinceId ?? null }
          : {}),
        ...(dto.cityId !== undefined ? { cityId: dto.cityId ?? null } : {}),
        ...(dto.city !== undefined || dto.cityId !== undefined
          ? { city: cityName ?? dto.city?.trim() ?? null }
          : {}),
        ...(dto.stateProvince !== undefined || dto.stateProvinceId !== undefined
          ? {
              stateProvince:
                stateProvinceName ?? dto.stateProvince?.trim() ?? null,
            }
          : {}),
        ...(dto.country !== undefined || dto.countryId !== undefined
          ? { country: countryName ?? dto.country?.trim() ?? null }
          : {}),
        ...(dto.postalCode !== undefined
          ? { postalCode: dto.postalCode?.trim() ?? null }
          : {}),
      },
      'EMPLOYEE_ADDRESS_UPDATED',
    );
  }

  async updateEmergencyContact(
    currentUser: AuthenticatedUser,
    employeeId: string,
    dto: UpdateEmergencyContactDto,
  ) {
    if (dto.emergencyContactRelationTypeId) {
      const relationType = await this.prisma.relationType.findFirst({
        where: {
          id: dto.emergencyContactRelationTypeId,
          isActive: true,
          OR: [{ tenantId: currentUser.tenantId }, { tenantId: null }],
        },
        select: { id: true },
      });

      if (!relationType) {
        throw new BadRequestException(
          'Selected emergency contact relation type is invalid.',
        );
      }
    }

    return this.updateEmployeeSection(
      currentUser,
      employeeId,
      {
        ...(dto.emergencyContactName !== undefined
          ? { emergencyContactName: dto.emergencyContactName?.trim() ?? null }
          : {}),
        ...(dto.emergencyContactRelationTypeId !== undefined
          ? {
              emergencyContactRelationTypeId:
                dto.emergencyContactRelationTypeId ?? null,
            }
          : {}),
        ...(dto.emergencyContactRelation !== undefined
          ? {
              emergencyContactRelation:
                dto.emergencyContactRelation?.trim() ?? null,
            }
          : {}),
        ...(dto.emergencyContactPhone !== undefined
          ? { emergencyContactPhone: dto.emergencyContactPhone?.trim() ?? null }
          : {}),
        ...(dto.emergencyContactAlternatePhone !== undefined
          ? {
              emergencyContactAlternatePhone:
                dto.emergencyContactAlternatePhone?.trim() ?? null,
            }
          : {}),
      },
      'EMPLOYEE_EMERGENCY_CONTACT_UPDATED',
    );
  }

  /*
   * Being allowed to read an employee record is not the same as being allowed
   * to see what that person is paid.
   *
   * This gate previously did not exist: the caller only had to pass
   * assertEmployeeAccess, the employee-record read check. Reporting managers
   * clear that check for their whole reporting subtree without holding any
   * compensation or payroll permission, so every manager could read their
   * reports' salary, bank account number, IBAN, routing number and tax
   * identifier. The write side of the same resource has always required
   * payroll.write, so read and write were asymmetric.
   *
   * Both halves of the permission model are consulted, because a role may carry
   * the compensation privilege in the matrix without the legacy key.
   * resolveEffectiveAccessLevel also returns TENANT for elevated tenant roles,
   * so those keep their existing reach.
   */
  private canViewCompensation(
    currentUser: AuthenticatedUser,
    accessMode: Awaited<
      ReturnType<EmployeeAccessService['getEmployeeRecordAccess']>
    >,
  ) {
    // Your own pay and your own bank details are yours to see.
    if (accessMode === 'SELF') return true;

    const permissions = new Set(currentUser.permissionKeys ?? []);
    if (
      permissions.has(PERMISSION_KEYS.COMPENSATION_READ) ||
      permissions.has(PERMISSION_KEYS.COMPENSATION_MANAGE) ||
      permissions.has(PERMISSION_KEYS.PAYROLL_READ)
    ) {
      return true;
    }

    return (
      resolveEffectiveAccessLevel(
        currentUser,
        ENTITY_KEYS.COMPENSATION,
        SecurityPrivilege.READ,
      ) !== SecurityAccessLevel.NONE
    );
  }

  async getCurrentCompensation(
    currentUser: AuthenticatedUser,
    employeeId: string,
  ) {
    await this.assertEmployeeAccess(currentUser, employeeId);

    const accessMode = await this.employeeAccessService.getEmployeeRecordAccess(
      currentUser,
      employeeId,
    );

    /*
     * Null is also what an employee with no compensation record returns, so a
     * caller cannot tell the two apart and no existence is disclosed.
     */
    if (!this.canViewCompensation(currentUser, accessMode)) {
      return null;
    }

    const compensation = await this.prisma.employeeCompensation.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        employeeId,
      },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
      // Explicit, so a column added to the model later is not published by default.
      select: employeeCompensationSelect,
    });

    return compensation
      ? {
          ...compensation,
          basicSalary: compensation.basicSalary.toString(),
        }
      : null;
  }

  async upsertCompensation(
    currentUser: AuthenticatedUser,
    employeeId: string,
    dto: UpsertEmployeeCompensationDto,
  ) {
    await this.assertEmployeeAccess(currentUser, employeeId);

    if (dto.endDate && new Date(dto.endDate) < new Date(dto.effectiveDate)) {
      throw new BadRequestException(
        'Compensation end date cannot be before the effective date.',
      );
    }

    await this.prisma.employeeCompensation.upsert({
      where: {
        tenantId_employeeId_effectiveDate: {
          tenantId: currentUser.tenantId,
          employeeId,
          effectiveDate: new Date(dto.effectiveDate),
        },
      },
      create: {
        tenantId: currentUser.tenantId,
        employeeId,
        basicSalary: new Prisma.Decimal(dto.basicSalary),
        payFrequency: dto.payFrequency,
        effectiveDate: new Date(dto.effectiveDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        currency: dto.currency?.trim().toUpperCase() ?? 'USD',
        payrollStatus: dto.payrollStatus,
        payrollGroup: dto.payrollGroup?.trim(),
        paymentMode: dto.paymentMode,
        bankName: dto.bankName?.trim(),
        bankAccountTitle: dto.bankAccountTitle?.trim(),
        bankAccountNumber: dto.bankAccountNumber?.trim(),
        bankIban: dto.bankIban?.trim(),
        bankRoutingNumber: dto.bankRoutingNumber?.trim(),
        taxIdentifier: dto.taxIdentifier?.trim(),
        notes: dto.notes?.trim(),
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      },
      update: {
        basicSalary: new Prisma.Decimal(dto.basicSalary),
        payFrequency: dto.payFrequency,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        currency: dto.currency?.trim().toUpperCase() ?? 'USD',
        payrollStatus: dto.payrollStatus,
        payrollGroup: dto.payrollGroup?.trim() ?? null,
        paymentMode: dto.paymentMode ?? null,
        bankName: dto.bankName?.trim() ?? null,
        bankAccountTitle: dto.bankAccountTitle?.trim() ?? null,
        bankAccountNumber: dto.bankAccountNumber?.trim() ?? null,
        bankIban: dto.bankIban?.trim() ?? null,
        bankRoutingNumber: dto.bankRoutingNumber?.trim() ?? null,
        taxIdentifier: dto.taxIdentifier?.trim() ?? null,
        notes: dto.notes?.trim() ?? null,
        updatedById: currentUser.userId,
      },
    });

    return this.getCurrentCompensation(currentUser, employeeId);
  }

  async listPreviousEmployments(
    currentUser: AuthenticatedUser,
    employeeId: string,
  ) {
    await this.assertEmployeeAccess(currentUser, employeeId);
    const items = await this.prisma.employeePreviousEmployment.findMany({
      where: { tenantId: currentUser.tenantId, employeeId },
      orderBy: [
        { endDate: 'desc' },
        { startDate: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return items.map((item) => ({
      ...item,
      finalSalary: item.finalSalary?.toString() ?? null,
    }));
  }

  async createPreviousEmployment(
    currentUser: AuthenticatedUser,
    employeeId: string,
    dto: CreateEmployeePreviousEmploymentDto,
  ) {
    await this.assertEmployeeChildPermission(
      currentUser,
      employeeId,
      'employees.update',
      'employees.update.self',
      'create previous employment records for this employee',
      true,
    );
    this.validatePreviousEmploymentDates(dto.startDate, dto.endDate);

    await this.prisma.employeePreviousEmployment.create({
      data: {
        tenantId: currentUser.tenantId,
        employeeId,
        companyName: dto.companyName.trim(),
        jobTitle: dto.jobTitle.trim(),
        department: dto.department?.trim(),
        employmentType: dto.employmentType?.trim(),
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        finalSalary: dto.finalSalary
          ? new Prisma.Decimal(dto.finalSalary)
          : undefined,
        reasonForLeaving: dto.reasonForLeaving?.trim(),
        referenceName: dto.referenceName?.trim(),
        referenceContact: dto.referenceContact?.trim(),
        notes: dto.notes?.trim(),
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      },
    });

    return this.listPreviousEmployments(currentUser, employeeId);
  }

  async updatePreviousEmployment(
    currentUser: AuthenticatedUser,
    employeeId: string,
    previousEmploymentId: string,
    dto: UpdateEmployeePreviousEmploymentDto,
  ) {
    await this.assertEmployeeChildPermission(
      currentUser,
      employeeId,
      'employees.update',
      'employees.update.self',
      'update previous employment records for this employee',
      true,
    );
    this.validatePreviousEmploymentDates(dto.startDate, dto.endDate);

    const result = await this.prisma.employeePreviousEmployment.updateMany({
      where: {
        id: previousEmploymentId,
        tenantId: currentUser.tenantId,
        employeeId,
      },
      data: {
        ...(dto.companyName !== undefined
          ? { companyName: dto.companyName.trim() }
          : {}),
        ...(dto.jobTitle !== undefined
          ? { jobTitle: dto.jobTitle.trim() }
          : {}),
        ...(dto.department !== undefined
          ? { department: dto.department?.trim() ?? null }
          : {}),
        ...(dto.employmentType !== undefined
          ? { employmentType: dto.employmentType?.trim() ?? null }
          : {}),
        ...(dto.startDate !== undefined
          ? { startDate: dto.startDate ? new Date(dto.startDate) : null }
          : {}),
        ...(dto.endDate !== undefined
          ? { endDate: dto.endDate ? new Date(dto.endDate) : null }
          : {}),
        ...(dto.finalSalary !== undefined
          ? {
              finalSalary: dto.finalSalary
                ? new Prisma.Decimal(dto.finalSalary)
                : null,
            }
          : {}),
        ...(dto.reasonForLeaving !== undefined
          ? { reasonForLeaving: dto.reasonForLeaving?.trim() ?? null }
          : {}),
        ...(dto.referenceName !== undefined
          ? { referenceName: dto.referenceName?.trim() ?? null }
          : {}),
        ...(dto.referenceContact !== undefined
          ? { referenceContact: dto.referenceContact?.trim() ?? null }
          : {}),
        ...(dto.notes !== undefined
          ? { notes: dto.notes?.trim() ?? null }
          : {}),
        updatedById: currentUser.userId,
      },
    });

    if (result.count === 0) {
      throw new NotFoundException(
        'Previous employment record was not found for this employee.',
      );
    }

    return this.listPreviousEmployments(currentUser, employeeId);
  }

  async removePreviousEmployment(
    currentUser: AuthenticatedUser,
    employeeId: string,
    previousEmploymentId: string,
  ) {
    await this.assertEmployeeChildPermission(
      currentUser,
      employeeId,
      'employees.update',
      'employees.update.self',
      'delete previous employment records for this employee',
      true,
    );
    const result = await this.prisma.employeePreviousEmployment.deleteMany({
      where: {
        id: previousEmploymentId,
        tenantId: currentUser.tenantId,
        employeeId,
      },
    });

    if (result.count === 0) {
      throw new NotFoundException(
        'Previous employment record was not found for this employee.',
      );
    }

    return { deleted: true, id: previousEmploymentId };
  }

  async listHistory(currentUser: AuthenticatedUser, employeeId: string) {
    await this.assertEmployeeAccess(currentUser, employeeId);
    const records = await this.prisma.employeeHistory.findMany({
      where: { tenantId: currentUser.tenantId, employeeId },
      orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
    });
    const userIds = records
      .map((record) => record.changedByUserId)
      .filter((item): item is string => Boolean(item));
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { tenantId: currentUser.tenantId, id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((user) => [user.id, user]));

    return records.map((record) => ({
      ...record,
      changedByUser: record.changedByUserId
        ? (userMap.get(record.changedByUserId) ?? null)
        : null,
    }));
  }

  async createHistory(
    currentUser: AuthenticatedUser,
    employeeId: string,
    dto: CreateEmployeeHistoryDto,
  ) {
    await this.assertEmployeeAccess(currentUser, employeeId);
    const created = await this.prisma.employeeHistory.create({
      data: {
        tenantId: currentUser.tenantId,
        employeeId,
        eventType: dto.eventType.trim().toLowerCase(),
        eventDate: new Date(dto.eventDate),
        title: dto.title.trim(),
        description: dto.description?.trim(),
        changedByUserId: currentUser.userId,
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      },
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'EMPLOYEE_HISTORY_CREATED',
      entityType: 'EmployeeHistory',
      entityId: created.id,
      afterSnapshot: created,
    });

    return this.listHistory(currentUser, employeeId);
  }

  async listEducation(currentUser: AuthenticatedUser, employeeId: string) {
    await this.assertEmployeeAccess(currentUser, employeeId);
    return this.prisma.employeeEducation.findMany({
      where: { tenantId: currentUser.tenantId, employeeId },
      orderBy: [{ endDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createEducation(
    currentUser: AuthenticatedUser,
    employeeId: string,
    dto: CreateEmployeeEducationDto,
  ) {
    await this.assertEmployeeChildPermission(
      currentUser,
      employeeId,
      'employees.education.create',
      'employees.education.create.self',
      'create education records for this employee',
      true,
    );
    await this.prisma.employeeEducation.create({
      data: {
        tenantId: currentUser.tenantId,
        employeeId,
        institutionName: dto.institutionName.trim(),
        degreeTitle: dto.degreeTitle.trim(),
        fieldOfStudy: dto.fieldOfStudy?.trim(),
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        gradeOrCgpa: dto.gradeOrCgpa?.trim(),
        description: dto.description?.trim(),
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      },
    });

    return this.listEducation(currentUser, employeeId);
  }

  async updateEducation(
    currentUser: AuthenticatedUser,
    employeeId: string,
    educationId: string,
    dto: UpdateEmployeeEducationDto,
  ) {
    await this.assertEmployeeChildPermission(
      currentUser,
      employeeId,
      'employees.education.update',
      'employees.education.update.self',
      'update education records for this employee',
      true,
    );
    const result = await this.prisma.employeeEducation.updateMany({
      where: { id: educationId, tenantId: currentUser.tenantId, employeeId },
      data: {
        ...(dto.institutionName !== undefined
          ? { institutionName: dto.institutionName.trim() }
          : {}),
        ...(dto.degreeTitle !== undefined
          ? { degreeTitle: dto.degreeTitle.trim() }
          : {}),
        ...(dto.fieldOfStudy !== undefined
          ? { fieldOfStudy: dto.fieldOfStudy?.trim() ?? null }
          : {}),
        ...(dto.startDate !== undefined
          ? { startDate: dto.startDate ? new Date(dto.startDate) : null }
          : {}),
        ...(dto.endDate !== undefined
          ? { endDate: dto.endDate ? new Date(dto.endDate) : null }
          : {}),
        ...(dto.gradeOrCgpa !== undefined
          ? { gradeOrCgpa: dto.gradeOrCgpa?.trim() ?? null }
          : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() ?? null }
          : {}),
        updatedById: currentUser.userId,
      },
    });

    if (result.count === 0) {
      throw new NotFoundException(
        'Employee education record was not found for this tenant.',
      );
    }

    return this.listEducation(currentUser, employeeId);
  }

  async removeEducation(
    currentUser: AuthenticatedUser,
    employeeId: string,
    educationId: string,
  ) {
    await this.assertEmployeeChildPermission(
      currentUser,
      employeeId,
      'employees.education.delete',
      'employees.education.delete.self',
      'delete education records for this employee',
      true,
    );
    const result = await this.prisma.employeeEducation.deleteMany({
      where: { id: educationId, tenantId: currentUser.tenantId, employeeId },
    });

    if (result.count === 0) {
      throw new NotFoundException(
        'Employee education record was not found for this tenant.',
      );
    }

    return { deleted: true, id: educationId };
  }

  async listEmployeeDocuments(
    currentUser: AuthenticatedUser,
    employeeId: string,
  ) {
    await this.assertEmployeeAccess(currentUser, employeeId);
    const accessMode = await this.employeeAccessService.getEmployeeRecordAccess(
      currentUser,
      employeeId,
    );
    const documents = await this.prisma.document.findMany({
      where: {
        tenantId: currentUser.tenantId,
        isArchived: false,
        profileImageForEmployee: null,
        links: { some: { employeeId } },
        ...(accessMode === 'SELF'
          ? { uploadedByUserId: currentUser.userId }
          : {}),
      },
      include: {
        documentType: {
          select: { id: true, key: true, name: true },
        },
        documentCategory: {
          select: { id: true, code: true, name: true },
        },
        uploadedByUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        _count: {
          select: { versions: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return documents.map((document) => ({
      id: document.id,
      fileName: document.originalFileName,
      title: document.title,
      description: document.description,
      documentTypeId: document.documentTypeId,
      documentType: document.documentType,
      documentCategoryId: document.documentCategoryId,
      documentCategory: document.documentCategory,
      mimeType: document.mimeType,
      size: document.sizeInBytes,
      storageKey: document.storageKey,
      createdAt: document.createdAt,
      uploadedAt: document.createdAt,
      updatedAt: document.updatedAt,
      version: document._count.versions + 1,
      uploadedByUser: document.uploadedByUser
        ? {
            ...document.uploadedByUser,
            fullName: `${document.uploadedByUser.firstName} ${document.uploadedByUser.lastName}`,
          }
        : null,
      viewPath: `/api/employees/${employeeId}/documents/${document.id}/view`,
      downloadPath: `/api/employees/${employeeId}/documents/${document.id}/download`,
    }));
  }

  async uploadEmployeeDocument(
    currentUser: AuthenticatedUser,
    employeeId: string,
    file: UploadedFile | undefined,
    dto: EmployeeDocumentUploadDto,
  ) {
    const employee = await this.assertEmployeeDocumentUploadAccess(
      currentUser,
      employeeId,
    );
    await this.validateEmployeeDocumentType(
      currentUser.tenantId,
      dto.documentTypeId,
    );
    await this.validateEmployeeDocumentCategory(
      currentUser.tenantId,
      dto.documentCategoryId,
    );
    const validatedFile = this.validateUploadedFile(
      file,
      ALLOWED_EMPLOYEE_DOCUMENT_TYPES,
    );
    const stored = await this.storageService.saveFile({
      buffer: validatedFile.buffer,
      originalFileName: validatedFile.originalname,
      subdirectory: `${currentUser.tenantId}/employees/${employeeId}/documents`,
    });

    const document = await this.prisma.$transaction(async (tx) => {
      const document = await this.documentsRepository.createDocument(
        {
          tenantId: currentUser.tenantId,
          documentTypeId: dto.documentTypeId,
          documentCategoryId: dto.documentCategoryId,
          title: dto.title?.trim(),
          originalFileName: validatedFile.originalname,
          storedFileName: stored.storageKey.split('/').pop() ?? null,
          mimeType: validatedFile.mimetype,
          fileExtension:
            extname(validatedFile.originalname).toLowerCase() || null,
          sizeInBytes: validatedFile.size,
          storageKey: stored.storageKey,
          uploadedByUserId: currentUser.userId,
          description: dto.description?.trim(),
          createdById: currentUser.userId,
          updatedById: currentUser.userId,
        },
        tx,
      );

      await this.documentsRepository.createLink(
        {
          tenantId: currentUser.tenantId,
          documentId: document.id,
          entityType: 'EMPLOYEE',
          entityId: employeeId,
          employeeId,
          createdById: currentUser.userId,
          updatedById: currentUser.userId,
        },
        tx,
      );

      return document;
    });

    await this.notificationsService.emit({
      tenantId: currentUser.tenantId,
      eventKey: 'employee.document.uploaded.hr',
      moduleKey: 'employee',
      actorUserId: currentUser.userId,
      relatedEntityType: 'employeeDocument',
      relatedEntityId: document.id,
      relatedRecordNumber: document.title ?? document.originalFileName,
      metadata: {
        employeeId,
        employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
        documentId: document.id,
        documentName: document.title ?? document.originalFileName,
        eventAtUtc: new Date().toISOString(),
        targetUrl: `/employees/${employeeId}?documentId=${encodeURIComponent(document.id)}`,
      },
    });

    return document;
  }

  async updateEmployeeDocument(
    currentUser: AuthenticatedUser,
    employeeId: string,
    documentId: string,
    file: UploadedFile | undefined,
    dto: EmployeeDocumentUploadDto,
  ) {
    const existing = await this.assertEmployeeDocumentWriteAccess(
      currentUser,
      employeeId,
      documentId,
      'update this employee document',
    );
    await this.validateEmployeeDocumentType(
      currentUser.tenantId,
      dto.documentTypeId,
    );
    await this.validateEmployeeDocumentCategory(
      currentUser.tenantId,
      dto.documentCategoryId,
    );

    const validatedFile = file
      ? this.validateUploadedFile(file, ALLOWED_EMPLOYEE_DOCUMENT_TYPES)
      : null;
    const stored = validatedFile
      ? await this.storageService.saveFile({
          buffer: validatedFile.buffer,
          originalFileName: validatedFile.originalname,
          subdirectory: `${currentUser.tenantId}/employees/${employeeId}/documents`,
        })
      : null;

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const latestVersion = await tx.documentVersion.findFirst({
          where: { tenantId: currentUser.tenantId, documentId },
          orderBy: { versionNumber: 'desc' },
          select: { versionNumber: true },
        });

        await tx.documentVersion.create({
          data: {
            tenantId: currentUser.tenantId,
            documentId,
            versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
            title: existing.title,
            originalFileName: existing.originalFileName,
            storedFileName: existing.storedFileName,
            mimeType: existing.mimeType,
            fileExtension: existing.fileExtension,
            sizeInBytes: existing.sizeInBytes,
            storageKey: existing.storageKey,
            documentTypeId: existing.documentTypeId,
            documentCategoryId: existing.documentCategoryId,
            description: existing.description,
            createdById: currentUser.userId,
          },
        });

        return tx.document.update({
          where: { id: documentId },
          data: {
            documentTypeId: dto.documentTypeId,
            documentCategoryId: dto.documentCategoryId,
            title: dto.title?.trim(),
            description: dto.description?.trim(),
            ...(validatedFile && stored
              ? {
                  originalFileName: validatedFile.originalname,
                  storedFileName: stored.storageKey.split('/').pop() ?? null,
                  mimeType: validatedFile.mimetype,
                  fileExtension:
                    extname(validatedFile.originalname).toLowerCase() || null,
                  sizeInBytes: validatedFile.size,
                  storageKey: stored.storageKey,
                }
              : {}),
            updatedById: currentUser.userId,
          },
        });
      });

      return updated;
    } catch (error) {
      if (stored?.storageKey) {
        await this.storageService.deleteFile(stored.storageKey);
      }
      throw error;
    }
  }

  async emitEmployeeDocumentExpiringReminder(input: {
    tenantId: string;
    actorUserId?: string | null;
    employeeId: string;
    documentId: string;
    documentName: string;
    expiresAtUtc?: Date | null;
  }) {
    // Document expiry detection is intentionally a call-site hook until the
    // platform has a shared scheduler for document lifecycle checks.
    return this.notificationsService.emit({
      tenantId: input.tenantId,
      eventKey: 'employee.document.expiring.employee',
      moduleKey: 'employee',
      actorUserId: input.actorUserId ?? null,
      relatedEntityType: 'employeeDocument',
      relatedEntityId: input.documentId,
      relatedRecordNumber: input.documentName,
      metadata: {
        employeeId: input.employeeId,
        documentId: input.documentId,
        documentName: input.documentName,
        expiresAtUtc: input.expiresAtUtc?.toISOString() ?? null,
        eventAtUtc: new Date().toISOString(),
        targetUrl: `/employees/${input.employeeId}?documentId=${encodeURIComponent(input.documentId)}`,
      },
    });
  }

  async downloadEmployeeDocument(
    currentUser: AuthenticatedUser,
    employeeId: string,
    documentId: string,
  ) {
    await this.assertEmployeeDocumentReadAccess(currentUser, employeeId);
    const accessMode = await this.employeeAccessService.getEmployeeRecordAccess(
      currentUser,
      employeeId,
    );
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        tenantId: currentUser.tenantId,
        links: { some: { employeeId } },
        ...(accessMode === 'SELF'
          ? { uploadedByUserId: currentUser.userId }
          : {}),
      },
    });

    if (!document || !document.storageKey) {
      throw new NotFoundException('Employee document was not found.');
    }

    return {
      document,
      file: await this.storageService.openFile(document.storageKey),
    };
  }

  async removeEmployeeDocument(
    currentUser: AuthenticatedUser,
    employeeId: string,
    documentId: string,
  ) {
    await this.assertEmployeeChildPermission(
      currentUser,
      employeeId,
      'employees.documents.delete',
      'employees.documents.delete.self',
      'delete this employee document',
      true,
    );
    await this.downloadEmployeeDocument(currentUser, employeeId, documentId);

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.updateMany({
        where: {
          id: employeeId,
          tenantId: currentUser.tenantId,
          profileImageDocumentId: documentId,
        },
        data: {
          profileImageDocumentId: null,
          updatedById: currentUser.userId,
        },
      });
      await tx.document.updateMany({
        where: { tenantId: currentUser.tenantId, id: documentId },
        data: {
          isArchived: true,
          updatedById: currentUser.userId,
        },
      });
    });

    return { deleted: true, id: documentId };
  }

  async uploadProfileImage(
    currentUser: AuthenticatedUser,
    employeeId: string,
    file: UploadedFile | undefined,
  ) {
    const employee = await this.assertProfileImageUploadAccess(
      currentUser,
      employeeId,
    );
    const validatedFile = this.validateUploadedFile(
      file,
      ALLOWED_PROFILE_IMAGE_TYPES,
    );
    const stored = await this.storageService.saveFile({
      buffer: validatedFile.buffer,
      originalFileName: validatedFile.originalname,
      subdirectory: `${currentUser.tenantId}/employees/${employeeId}/profile-image`,
    });

    const document = await this.prisma.$transaction(async (tx) => {
      if (employee.profileImageDocumentId) {
        await tx.documentLink.deleteMany({
          where: {
            tenantId: currentUser.tenantId,
            documentId: employee.profileImageDocumentId,
            employeeId,
          },
        });
        await tx.document.deleteMany({
          where: {
            tenantId: currentUser.tenantId,
            id: employee.profileImageDocumentId,
          },
        });
      }

      const created = await this.documentsRepository.createDocument(
        {
          tenantId: currentUser.tenantId,
          title: 'Profile Image',
          originalFileName: validatedFile.originalname,
          storedFileName: stored.storageKey.split('/').pop() ?? null,
          mimeType: validatedFile.mimetype,
          fileExtension:
            extname(validatedFile.originalname).toLowerCase() || null,
          sizeInBytes: validatedFile.size,
          storageKey: stored.storageKey,
          uploadedByUserId: currentUser.userId,
          description: 'Employee profile image',
          createdById: currentUser.userId,
          updatedById: currentUser.userId,
        },
        tx,
      );

      await this.documentsRepository.createLink(
        {
          tenantId: currentUser.tenantId,
          documentId: created.id,
          entityType: 'EMPLOYEE',
          entityId: employeeId,
          employeeId,
          createdById: currentUser.userId,
          updatedById: currentUser.userId,
        },
        tx,
      );

      await tx.employee.update({
        where: { id: employeeId },
        data: {
          profileImageDocumentId: created.id,
          updatedById: currentUser.userId,
        },
      });

      return created;
    });

    if (employee.profileImageDocument?.storageKey) {
      await this.storageService.deleteFile(
        employee.profileImageDocument.storageKey,
      );
    }

    return {
      id: document.id,
      fileName: document.originalFileName,
      mimeType: document.mimeType,
      size: document.sizeInBytes,
      downloadPath: `/api/employees/${employeeId}/profile-image`,
    };
  }

  async getProfileImage(currentUser: AuthenticatedUser, employeeId: string) {
    const employee = await this.assertEmployeeImageReadAccess(
      currentUser,
      employeeId,
    );

    if (
      !employee.profileImageDocument ||
      !employee.profileImageDocument.storageKey
    ) {
      throw new NotFoundException('Employee profile image was not found.');
    }

    if (
      !employee.profileImageDocument.mimeType ||
      !ALLOWED_PROFILE_IMAGE_TYPES.has(employee.profileImageDocument.mimeType)
    ) {
      throw new NotFoundException('Employee profile image was not found.');
    }

    return {
      document: employee.profileImageDocument,
      file: await this.storageService.openFile(
        employee.profileImageDocument.storageKey,
      ),
    };
  }

  async listLeaveHistory(currentUser: AuthenticatedUser, employeeId: string) {
    await this.assertEmployeeAccess(currentUser, employeeId);
    const records = await this.prisma.leaveRequest.findMany({
      where: { tenantId: currentUser.tenantId, employeeId },
      include: {
        leaveType: { select: { id: true, name: true, code: true } },
        approvalSteps: {
          include: {
            approverUser: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { stepOrder: 'asc' },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return records.map((record) => ({
      id: record.id,
      startDate: record.startDate,
      endDate: record.endDate,
      totalDays: record.totalDays,
      status: record.status,
      reason: record.reason,
      leaveType: record.leaveType,
      approver:
        record.approvalSteps.find((step) => step.approverUser)?.approverUser ??
        null,
      createdAt: record.createdAt,
    }));
  }

  async listAttendanceHistory(
    currentUser: AuthenticatedUser,
    employeeId: string,
  ) {
    await this.assertEmployeeAccess(currentUser, employeeId);
    const records = await this.prisma.attendanceEntry.findMany({
      where: { tenantId: currentUser.tenantId, employeeId },
      orderBy: [{ date: 'desc' }],
      take: 250,
      select: {
        id: true,
        date: true,
        status: true,
        checkIn: true,
        checkOut: true,
        attendanceMode: true,
      },
    });
    return records.map((record) => ({
      ...record,
      attendanceDate: record.date,
      attendanceStatus: record.status,
      checkInAt: record.checkIn,
      checkOutAt: record.checkOut,
    }));
  }

  async listTimesheetHistory(
    currentUser: AuthenticatedUser,
    employeeId: string,
  ) {
    await this.assertEmployeeAccess(currentUser, employeeId);
    const records = await this.prisma.timesheet.findMany({
      where: { tenantId: currentUser.tenantId, employeeId },
      orderBy: [{ periodStart: 'desc' }],
      take: 120,
      include: { entries: { select: { hours: true } } },
    });
    return records.map(({ entries, ...record }) => ({
      ...record,
      totalHours: entries
        .reduce((total, entry) => total.add(entry.hours), new Prisma.Decimal(0))
        .toString(),
    }));
  }

  async sendPasswordResetLink(
    currentUser: AuthenticatedUser,
    employeeId: string,
  ) {
    if (!canManageEmployeeAccountActions(currentUser)) {
      throw new ForbiddenException(
        'Only Global Admin, System Admin, and HR can send employee password reset links.',
      );
    }

    const employee = await this.assertEmployeeAccess(currentUser, employeeId);

    if (!employee.userId || !employee.user) {
      throw new BadRequestException(
        'A password reset link can only be sent to an employee with a linked user account.',
      );
    }

    const workEmail = employee.email ? normalizeEmail(employee.email) : null;

    if (!workEmail) {
      throw new BadRequestException(
        'Employee does not have an official work email address configured.',
      );
    }

    const recipientEmail = normalizeEmail(employee.user.email);
    if (recipientEmail !== workEmail) {
      throw new BadRequestException(
        'Employee work email must match the linked user authentication email before a password reset can be sent.',
      );
    }

    const resetToken = this.jwtService.sign(
      {
        sub: employee.user.id,
        tenantId: currentUser.tenantId,
        type: 'password-reset',
      },
      { secret: getAccessTokenSecret(this.configService), expiresIn: '1d' },
    );
    const baseUrl =
      this.configService.get<string>('PASSWORD_RESET_LINK_BASE_URL') ??
      `${getAppOrigin('web', process.env)}/reset-password`;
    const resetLink = `${baseUrl}?token=${encodeURIComponent(resetToken)}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const delivery = await this.sendPasswordResetEmail({
      tenantId: currentUser.tenantId,
      userId: employee.user.id,
      employeeId: employee.id,
      recipientEmail,
      fullName: `${employee.firstName} ${employee.lastName}`,
      resetLink,
      expiresAt,
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'EMPLOYEE_PASSWORD_RESET_LINK_SENT',
      entityType: 'User',
      entityId: employee.user.id,
      afterSnapshot: {
        recipientEmail,
        deliveryMode: delivery.sent ? 'sent' : 'disabled',
        deliveryStatus: delivery.status,
        deliveryLogId: delivery.deliveryLogId,
      },
    });

    return {
      sent: delivery.sent,
      deliveryMode: delivery.sent ? 'sent' : 'disabled',
      deliveryStatus: delivery.status,
      recipientEmail,
    };
  }

  private async sendPasswordResetEmail(input: {
    tenantId: string;
    userId: string;
    employeeId: string;
    recipientEmail: string;
    fullName: string;
    resetLink: string;
    expiresAt: Date;
  }) {
    const [tenant, branding] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: input.tenantId },
        select: { name: true },
      }),
      this.tenantSettingsResolver.getBrandingSettings(input.tenantId),
    ]);

    return this.emailService.sendTemplateEmail({
      tenantId: input.tenantId,
      subjectEmployeeId: input.employeeId,
      eventCode: 'AUTH_PASSWORD_RESET',
      templateKey: 'AUTH_PASSWORD_RESET',
      recipient: input.recipientEmail,
      variables: {
        firstName: input.fullName.trim().split(/\s+/)[0] || '',
        name: input.fullName,
        email: input.recipientEmail,
        tenantName: tenant?.name ?? branding.brandName ?? 'DijiPeople',
        appName: branding.appTitle || 'DijiPeople',
        recipientName: input.fullName,
        resetUrl: input.resetLink,
        expiresIn: '24 hours',
        expiresAt: input.expiresAt.toISOString(),
        supportEmail:
          branding.supportEmail ||
          this.configService.get<string>('SUPPORT_EMAIL') ||
          'support@dijipeople.com',
        primaryColor: branding.primaryColor || '#0f766e',
        logoUrl:
          branding.logoUrl || `${getAppOrigin('web', process.env)}/favicon.ico`,
      },
      metadata: {
        userId: input.userId,
        employeeId: input.employeeId,
        resetUrl: input.resetLink,
        source: 'employee-password-reset',
      },
      requestedByUserId: input.userId,
    });
  }

  private async updateEmployeeSection(
    currentUser: AuthenticatedUser,
    employeeId: string,
    data: Prisma.EmployeeUncheckedUpdateInput,
    action: string,
  ) {
    await this.assertEmployeeWriteAccess(currentUser, employeeId);
    const before = await this.getProfile(currentUser, employeeId);
    const result = await this.prisma.employee.updateMany({
      where: { id: employeeId, tenantId: currentUser.tenantId },
      data: { ...data, updatedById: currentUser.userId },
    });

    if (result.count === 0) {
      throw new NotFoundException('Employee was not found for this tenant.');
    }

    const after = await this.getProfile(currentUser, employeeId);
    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action,
      entityType: 'Employee',
      entityId: employeeId,
      beforeSnapshot: before,
      afterSnapshot: after,
    });

    return after;
  }

  private async assertEmployeeExists(
    tenantId: string,
    employeeId: string,
    accessWhere: Prisma.EmployeeWhereInput = {},
  ) {
    const employee = await this.employeesRepository.findByIdAndTenant(
      tenantId,
      employeeId,
      accessWhere,
    );

    if (!employee) {
      throw new NotFoundException('Employee was not found for this tenant.');
    }

    return employee;
  }

  private async assertEmployeeAccess(
    currentUser: AuthenticatedUser,
    employeeId: string,
  ) {
    const employee = await this.assertEmployeeExists(
      currentUser.tenantId,
      employeeId,
    );

    if (
      !(await this.employeeAccessService.canViewEmployeeRecord(
        currentUser,
        employeeId,
      ))
    ) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'You do not have permission to view this employee record.',
      });
    }

    return employee;
  }

  private async assertEmployeeWriteAccess(
    currentUser: AuthenticatedUser,
    employeeId: string,
  ) {
    if (
      !(await this.employeeAccessService.canWriteEmployeeRecord(
        currentUser,
        employeeId,
      ))
    ) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'You do not have permission to update this employee record.',
      });
    }

    return this.assertEmployeeAccess(currentUser, employeeId);
  }

  private async assertEmployeeChildPermission(
    currentUser: AuthenticatedUser,
    employeeId: string,
    adminPermission: string,
    selfPermission: string,
    actionLabel: string,
    allowSelfService = false,
  ) {
    const accessMode = await this.employeeAccessService.getEmployeeRecordAccess(
      currentUser,
      employeeId,
    );
    const allowed =
      accessMode === 'ADMIN_MANAGE' ||
      (accessMode === 'HR_MANAGE' &&
        currentUser.permissionKeys.includes(adminPermission)) ||
      (accessMode === 'SELF' &&
        (allowSelfService ||
          currentUser.permissionKeys.includes(selfPermission)));

    if (!allowed) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: `You do not have permission to ${actionLabel}.`,
      });
    }

    return this.assertEmployeeAccess(currentUser, employeeId);
  }

  private async assertProfileImageUploadAccess(
    currentUser: AuthenticatedUser,
    employeeId: string,
  ) {
    if (
      !(await this.employeeAccessService.canUploadEmployeeProfileImage(
        currentUser,
        employeeId,
      ))
    ) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message:
          'You do not have permission to update this employee profile image.',
      });
    }

    return this.assertEmployeeAccess(currentUser, employeeId);
  }

  private async assertEmployeeDocumentUploadAccess(
    currentUser: AuthenticatedUser,
    employeeId: string,
  ) {
    if (
      !(await this.employeeAccessService.canUploadEmployeeDocument(
        currentUser,
        employeeId,
      ))
    ) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'You do not have permission to upload this employee document.',
      });
    }

    return this.assertEmployeeAccess(currentUser, employeeId);
  }

  private async assertEmployeeDocumentReadAccess(
    currentUser: AuthenticatedUser,
    employeeId: string,
  ) {
    if (
      !(await this.employeeAccessService.canReadEmployeeDocument(
        currentUser,
        employeeId,
      ))
    ) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'You do not have permission to view this employee document.',
      });
    }

    return this.assertEmployeeAccess(currentUser, employeeId);
  }

  private async assertEmployeeDocumentWriteAccess(
    currentUser: AuthenticatedUser,
    employeeId: string,
    documentId: string,
    actionLabel: string,
  ) {
    const [employee, accessMode] = await Promise.all([
      this.assertEmployeeAccess(currentUser, employeeId),
      this.employeeAccessService.getEmployeeRecordAccess(
        currentUser,
        employeeId,
      ),
    ]);
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        tenantId: currentUser.tenantId,
        isArchived: false,
        profileImageForEmployee: null,
        links: { some: { employeeId } },
      },
    });

    if (!document) {
      throw new NotFoundException('Employee document was not found.');
    }

    const hasAdminPermission =
      currentUser.permissionKeys.includes('employees.documents.upload') ||
      currentUser.permissionKeys.includes('employees.documents.delete');
    const allowed =
      accessMode === 'ADMIN_MANAGE' ||
      (accessMode === 'HR_MANAGE' && hasAdminPermission) ||
      (accessMode === 'SELF' &&
        document.uploadedByUserId === currentUser.userId);

    if (!allowed) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: `You do not have permission to ${actionLabel}.`,
      });
    }

    return { ...document, employee };
  }

  private async assertEmployeeImageReadAccess(
    currentUser: AuthenticatedUser,
    employeeId: string,
  ) {
    const employee = await this.assertEmployeeExists(
      currentUser.tenantId,
      employeeId,
    );

    if (
      !(await this.employeeAccessService.canViewEmployeeRecord(
        currentUser,
        employeeId,
      ))
    ) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'You do not have permission to view this employee record.',
      });
    }

    return employee;
  }

  private validatePreviousEmploymentDates(
    startDate?: string,
    endDate?: string,
  ) {
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      throw new BadRequestException(
        'Previous employment end date cannot be before the start date.',
      );
    }
  }

  private async buildProfileImageSummary(
    employee: Awaited<
      ReturnType<EmployeeProfilesService['assertEmployeeAccess']>
    >,
  ) {
    const document = employee.profileImageDocument;

    if (
      !document ||
      !document.storageKey ||
      !document.mimeType ||
      !ALLOWED_PROFILE_IMAGE_TYPES.has(document.mimeType) ||
      !(await this.storageService.fileExists(document.storageKey))
    ) {
      return null;
    }

    return {
      id: document.id,
      fileName: document.originalFileName,
      mimeType: document.mimeType,
      size: document.sizeInBytes,
      createdAt: document.createdAt,
      downloadPath: `/api/employees/${employee.id}/profile-image`,
    };
  }

  private validateUploadedFile(
    file: UploadedFile | undefined,
    allowedMimeTypes: Set<string>,
  ) {
    if (!file) {
      throw new BadRequestException('A file upload is required.');
    }

    if (!allowedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException('Uploaded file type is not supported.');
    }

    if (file.size > this.storageService.getMaxUploadBytes()) {
      throw new BadRequestException(
        'Uploaded file exceeds the allowed size limit.',
      );
    }

    return file;
  }

  private async validateEmployeeDocumentType(
    tenantId: string,
    documentTypeId: string,
  ) {
    const documentType = await this.prisma.documentType.findFirst({
      where: {
        id: documentTypeId,
        isActive: true,
        OR: [{ tenantId }, { tenantId: null }],
      },
      select: { id: true },
    });

    if (!documentType) {
      throw new BadRequestException(
        'Selected employee document type is invalid for this tenant.',
      );
    }
  }

  private async validateEmployeeDocumentCategory(
    tenantId: string,
    documentCategoryId?: string,
  ) {
    if (!documentCategoryId) {
      return;
    }

    const documentCategory = await this.prisma.documentCategory.findFirst({
      where: {
        id: documentCategoryId,
        isActive: true,
        OR: [{ tenantId }, { tenantId: null }],
      },
      select: { id: true },
    });

    if (!documentCategory) {
      throw new BadRequestException(
        'Selected employee document category is invalid for this tenant.',
      );
    }
  }
}

function buildDerivedStats(hireDate: Date, dateOfBirth: Date | null) {
  const today = new Date();
  return {
    yearsSinceJoining: differenceInYears(today, hireDate),
    daysSinceJoining: differenceInDays(today, hireDate),
    age: dateOfBirth ? differenceInYears(today, dateOfBirth) : null,
    birthdayToday: dateOfBirth
      ? today.getMonth() === dateOfBirth.getMonth() &&
        today.getDate() === dateOfBirth.getDate()
      : false,
    daysUntilBirthday: dateOfBirth
      ? calculateDaysUntilBirthday(today, dateOfBirth)
      : null,
  };
}

function differenceInYears(later: Date, earlier: Date) {
  let years = later.getFullYear() - earlier.getFullYear();
  if (
    later.getMonth() < earlier.getMonth() ||
    (later.getMonth() === earlier.getMonth() &&
      later.getDate() < earlier.getDate())
  ) {
    years -= 1;
  }
  return Math.max(0, years);
}

function differenceInDays(later: Date, earlier: Date) {
  const msPerDay = 1000 * 60 * 60 * 24;
  const normalizedLater = new Date(later);
  normalizedLater.setHours(0, 0, 0, 0);
  const normalizedEarlier = new Date(earlier);
  normalizedEarlier.setHours(0, 0, 0, 0);
  return Math.max(
    0,
    Math.floor(
      (normalizedLater.getTime() - normalizedEarlier.getTime()) / msPerDay,
    ),
  );
}

function calculateDaysUntilBirthday(today: Date, dateOfBirth: Date) {
  const nextBirthday = new Date(today);
  nextBirthday.setMonth(dateOfBirth.getMonth(), dateOfBirth.getDate());
  nextBirthday.setHours(0, 0, 0, 0);
  if (nextBirthday < today) {
    nextBirthday.setFullYear(today.getFullYear() + 1);
  }
  return differenceInDays(nextBirthday, today);
}
