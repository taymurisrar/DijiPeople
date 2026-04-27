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
import { Prisma } from '@prisma/client';
import { normalizeEmail } from '../../common/utils/email.util';
import { getAccessTokenSecret } from '../../common/config/auth.config';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { MailerService } from '../../common/mailer/mailer.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { DocumentsRepository } from '../documents/documents.repository';
import { EmployeesRepository } from './employees.repository';
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

const ALLOWED_PROFILE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);

@Injectable()
export class EmployeeProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employeesRepository: EmployeesRepository,
    private readonly documentsRepository: DocumentsRepository,
    private readonly storageService: StorageService,
    private readonly auditService: AuditService,
    private readonly mailerService: MailerService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async getProfile(currentUser: AuthenticatedUser, employeeId: string) {
    const employee = await this.assertEmployeeAccess(currentUser, employeeId);
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
      designationId: employee.designationId,
      locationId: employee.locationId,
      officialJoiningLocationId: employee.officialJoiningLocationId,
      managerEmployeeId: employee.managerEmployeeId,
      reportingManagerEmployeeId: employee.managerEmployeeId,
      userId: employee.userId,
      addressLine1: employee.addressLine1,
      addressLine2: employee.addressLine2,
      city: employee.cityLookup?.name ?? employee.city,
      stateProvince:
        employee.stateProvinceLookup?.name ?? employee.stateProvince,
      country: employee.countryLookup?.name ?? employee.country,
      postalCode: employee.postalCode,
      emergencyContactName: employee.emergencyContactName,
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
      department: employee.department,
      designation: employee.designation,
      location: employee.location,
      officialJoiningLocation: employee.officialJoiningLocation,
      profileImage: employee.profileImageDocument
        ? {
            id: employee.profileImageDocument.id,
            fileName: employee.profileImageDocument.originalFileName,
            mimeType: employee.profileImageDocument.mimeType,
            size: employee.profileImageDocument.sizeInBytes,
            downloadPath: `/api/employees/${employee.id}/profile-image`,
          }
        : null,
      basicProfile: {
        fullName,
        employeeCode: employee.employeeCode,
        designation: employee.designation?.name ?? null,
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
        designation: employee.designation,
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
    let countryName: string | null | undefined;
    let stateProvinceName: string | null | undefined;
    let cityName: string | null | undefined;

    if (dto.countryId) {
      const country = await this.prisma.country.findFirst({
        where: { id: dto.countryId, isActive: true },
        select: { id: true, name: true },
      });

      if (!country) {
        throw new BadRequestException('Selected country is invalid.');
      }

      countryName = country.name;
    }

    if (dto.stateProvinceId) {
      const stateProvince = await this.prisma.stateProvince.findFirst({
        where: {
          id: dto.stateProvinceId,
          isActive: true,
          ...(dto.countryId ? { countryId: dto.countryId } : {}),
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

    if (dto.cityId) {
      const city = await this.prisma.city.findFirst({
        where: {
          id: dto.cityId,
          isActive: true,
          ...(dto.countryId ? { countryId: dto.countryId } : {}),
          ...(dto.stateProvinceId
            ? { stateProvinceId: dto.stateProvinceId }
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

  async getCurrentCompensation(
    currentUser: AuthenticatedUser,
    employeeId: string,
  ) {
    await this.assertEmployeeAccess(currentUser, employeeId);
    const compensation = await this.prisma.employeeCompensation.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        employeeId,
      },
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
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
    await this.assertEmployeeAccess(currentUser, employeeId);
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
    await this.assertEmployeeAccess(currentUser, employeeId);
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
    await this.assertEmployeeAccess(currentUser, employeeId);
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
    await this.assertEmployeeAccess(currentUser, employeeId);
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
    await this.assertEmployeeAccess(currentUser, employeeId);
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
    await this.assertEmployeeAccess(currentUser, employeeId);
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
    const documents = await this.prisma.document.findMany({
      where: {
        tenantId: currentUser.tenantId,
        isArchived: false,
        profileImageForEmployee: null,
        links: { some: { employeeId } },
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
    await this.assertEmployeeAccess(currentUser, employeeId);
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

    return this.prisma.$transaction(async (tx) => {
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
  }

  async downloadEmployeeDocument(
    currentUser: AuthenticatedUser,
    employeeId: string,
    documentId: string,
  ) {
    await this.assertEmployeeAccess(currentUser, employeeId);
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        tenantId: currentUser.tenantId,
        links: { some: { employeeId } },
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
    const { document } = await this.downloadEmployeeDocument(
      currentUser,
      employeeId,
      documentId,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.documentLink.deleteMany({
        where: { tenantId: currentUser.tenantId, documentId, employeeId },
      });
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
      await tx.document.deleteMany({
        where: { tenantId: currentUser.tenantId, id: documentId },
      });
    });

    await this.storageService.deleteFile(document.storageKey);
    return { deleted: true, id: documentId };
  }

  async uploadProfileImage(
    currentUser: AuthenticatedUser,
    employeeId: string,
    file: UploadedFile | undefined,
  ) {
    const employee = await this.assertEmployeeAccess(currentUser, employeeId);
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
    const employee = await this.assertEmployeeAccess(currentUser, employeeId);

    if (
      !employee.profileImageDocument ||
      !employee.profileImageDocument.storageKey
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

  async sendPasswordResetLink(
    currentUser: AuthenticatedUser,
    employeeId: string,
  ) {
    const employee = await this.assertEmployeeAccess(currentUser, employeeId);

    if (!employee.userId || !employee.user) {
      throw new BadRequestException(
        'A password reset link can only be sent to an employee with a linked user account.',
      );
    }

    const recipientEmail = employee.user.email;

    if (!recipientEmail) {
      throw new BadRequestException(
        'Employee does not have an official work email address configured.',
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
    const delivery = await this.mailerService.sendPasswordResetLink({
      to: recipientEmail,
      fullName: `${employee.firstName} ${employee.lastName}`,
      resetLink,
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'EMPLOYEE_PASSWORD_RESET_LINK_SENT',
      entityType: 'User',
      entityId: employee.user.id,
      afterSnapshot: { recipientEmail, deliveryMode: delivery.deliveryMode },
    });

    return { sent: true, deliveryMode: delivery.deliveryMode, recipientEmail };
  }

  private async updateEmployeeSection(
    currentUser: AuthenticatedUser,
    employeeId: string,
    data: Prisma.EmployeeUncheckedUpdateInput,
    action: string,
  ) {
    await this.assertEmployeeAccess(currentUser, employeeId);
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

  private async assertEmployeeExists(tenantId: string, employeeId: string) {
    const employee = await this.employeesRepository.findByIdAndTenant(
      tenantId,
      employeeId,
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
      this.isSelfServiceUser(currentUser) &&
      employee.userId !== currentUser.userId
    ) {
      throw new ForbiddenException(
        'You can only access your own employee profile.',
      );
    }

    if (
      this.isManagerScopedUser(currentUser) &&
      employee.userId !== currentUser.userId &&
      employee.manager?.userId !== currentUser.userId
    ) {
      throw new ForbiddenException(
        'Managers can only access profiles for their direct reports.',
      );
    }

    return employee;
  }

  private isSelfServiceUser(currentUser: AuthenticatedUser) {
    return (
      currentUser.roleKeys.includes('employee') &&
      currentUser.roleKeys.every((roleKey) => roleKey === 'employee')
    );
  }

  private isManagerScopedUser(currentUser: AuthenticatedUser) {
    const elevatedRoleKeys = new Set(['admin', 'hr', 'system-admin']);
    return (
      currentUser.roleKeys.includes('manager') &&
      currentUser.roleKeys.every((roleKey) => !elevatedRoleKeys.has(roleKey))
    );
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

