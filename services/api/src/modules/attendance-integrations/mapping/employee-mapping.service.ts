import { Injectable } from '@nestjs/common';
import {
  EmployeeEmploymentStatus,
  ExternalIdentityStatus,
  ExternalUserMappingStatus,
} from '@prisma/client';

import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Matching device users to DijiPeople employees.
 *
 * The governing rule: a mapping is only ever *confirmed automatically* when the
 * evidence is an exact identifier match. Name similarity produces a suggestion a
 * human must accept. Two people called "M. Khan" are common; silently attributing
 * one person's attendance to the other is a payroll error that is very hard to
 * unpick after the fact.
 */

export type MatchStrategy =
  | 'EXISTING_IDENTITY'
  | 'EMPLOYEE_CODE'
  | 'EXTERNAL_EMPLOYEE_CODE'
  | 'EMAIL'
  | 'NAME_SUGGESTION';

export type MatchConfidence = 'CONFIRMED' | 'HIGH' | 'SUGGESTION' | 'NONE';

export interface MatchCandidate {
  employeeId: string;
  employeeCode: string;
  displayName: string;
  strategy: MatchStrategy;
  confidence: MatchConfidence;
  reason: string;
}

export interface MatchResult {
  externalUserId: string;
  /** Set only when the match may be applied without a human decision. */
  autoMatch: MatchCandidate | null;
  /** Ordered best-first. Presented for a human to choose from. */
  suggestions: MatchCandidate[];
  /** More than one equally-strong identifier match — needs resolution. */
  conflict: boolean;
  conflictReason?: string;
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

@Injectable()
export class EmployeeMappingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Works out who a discovered device user is.
   *
   * Strategies are tried in descending order of evidence quality and stop at the
   * first that yields a confirmable answer:
   *
   *   1. an existing EmployeeExternalIdentity  — already decided previously
   *   2. employee code == external user id     — exact identifier
   *   3. employee code == externalEmployeeCode — exact identifier
   *   4. verified email                        — exact identifier
   *   5. exact normalised name                 — SUGGESTION ONLY, never applied
   */
  async match(input: {
    tenantId: string;
    integrationId: string;
    deviceId?: string | null;
    externalUserId: string;
    externalName?: string | null;
    externalEmployeeCode?: string | null;
    externalEmail?: string | null;
  }): Promise<MatchResult> {
    const externalUserId = input.externalUserId.trim();
    const result: MatchResult = {
      externalUserId,
      autoMatch: null,
      suggestions: [],
      conflict: false,
    };

    // 1. A decision already exists for this identity.
    const existing = await this.prisma.employeeExternalIdentity.findFirst({
      where: {
        tenantId: input.tenantId,
        integrationId: input.integrationId,
        externalUserId,
        status: ExternalIdentityStatus.ACTIVE,
        OR: [
          { deviceId: null },
          ...(input.deviceId ? [{ deviceId: input.deviceId }] : []),
        ],
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      // Prefer the device-specific identity when both exist.
      orderBy: { deviceId: 'desc' },
    });

    if (existing?.employee) {
      result.autoMatch = {
        employeeId: existing.employee.id,
        employeeCode: existing.employee.employeeCode,
        displayName:
          `${existing.employee.firstName} ${existing.employee.lastName}`.trim(),
        strategy: 'EXISTING_IDENTITY',
        confidence: 'CONFIRMED',
        reason: 'An existing mapping already links this device user.',
      };
      return result;
    }

    const codeCandidates = [
      externalUserId,
      input.externalEmployeeCode?.trim(),
    ].filter((value): value is string => Boolean(value));

    // 2 & 3. Exact employee-code matches.
    if (codeCandidates.length > 0) {
      const employees = await this.prisma.employee.findMany({
        where: {
          tenantId: input.tenantId,
          employeeCode: { in: codeCandidates },
          employmentStatus: EmployeeEmploymentStatus.ACTIVE,
        },
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
        },
      });

      if (employees.length === 1) {
        const employee = employees[0];
        const strategy: MatchStrategy =
          employee.employeeCode === externalUserId
            ? 'EMPLOYEE_CODE'
            : 'EXTERNAL_EMPLOYEE_CODE';
        result.autoMatch = {
          employeeId: employee.id,
          employeeCode: employee.employeeCode,
          displayName: `${employee.firstName} ${employee.lastName}`.trim(),
          strategy,
          confidence: 'HIGH',
          reason: `Employee number ${employee.employeeCode} matches the device user id exactly.`,
        };
        return result;
      }

      if (employees.length > 1) {
        // Should be impossible given the unique index, but if it happens the
        // safe outcome is a human decision, not a coin flip.
        result.conflict = true;
        result.conflictReason =
          'More than one active employee shares this employee number.';
        result.suggestions = employees.map((employee) => ({
          employeeId: employee.id,
          employeeCode: employee.employeeCode,
          displayName: `${employee.firstName} ${employee.lastName}`.trim(),
          strategy: 'EMPLOYEE_CODE',
          confidence: 'SUGGESTION',
          reason: 'Ambiguous employee number match.',
        }));
        return result;
      }
    }

    // 4. Email, when the source exposes one.
    const email = input.externalEmail?.trim().toLowerCase();
    if (email) {
      const byEmail = await this.prisma.employee.findMany({
        where: {
          tenantId: input.tenantId,
          email: { equals: email, mode: 'insensitive' },
          employmentStatus: EmployeeEmploymentStatus.ACTIVE,
        },
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
        },
      });

      if (byEmail.length === 1) {
        const employee = byEmail[0];
        result.autoMatch = {
          employeeId: employee.id,
          employeeCode: employee.employeeCode,
          displayName: `${employee.firstName} ${employee.lastName}`.trim(),
          strategy: 'EMAIL',
          confidence: 'HIGH',
          reason: 'Work email reported by the device matches this employee.',
        };
        return result;
      }
    }

    // 5. Name — suggestion only. Never returned as an auto-match.
    const externalName = input.externalName?.trim();
    if (externalName) {
      const normalized = normalizeName(externalName);
      const employees = await this.prisma.employee.findMany({
        where: {
          tenantId: input.tenantId,
          employmentStatus: EmployeeEmploymentStatus.ACTIVE,
        },
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
        },
        take: 2000,
      });

      const nameMatches = employees.filter(
        (employee) =>
          normalizeName(`${employee.firstName} ${employee.lastName}`) ===
          normalized,
      );

      result.suggestions = nameMatches.map((employee) => ({
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        displayName: `${employee.firstName} ${employee.lastName}`.trim(),
        strategy: 'NAME_SUGGESTION',
        confidence: 'SUGGESTION',
        reason:
          'The name on the device matches this employee. Confirm before mapping — names are not unique.',
      }));

      if (nameMatches.length > 1) {
        result.conflict = true;
        result.conflictReason =
          'Several employees share this name. Choose the correct one.';
      }
    }

    return result;
  }

  /**
   * Confirms a mapping.
   *
   * Supersedes any previous identity for the same external user rather than
   * deleting it: the old row is marked INACTIVE so the trail of who attendance
   * used to be attributed to survives.
   */
  async confirmMapping(input: {
    tenantId: string;
    integrationId: string;
    deviceId?: string | null;
    externalUserId: string;
    employeeId: string;
    actorUserId?: string | null;
    mappingSource: MatchStrategy | 'MANUAL';
  }) {
    const { tenantId, integrationId, employeeId } = input;
    const deviceId = input.deviceId ?? null;
    const externalUserId = input.externalUserId.trim();

    return this.prisma.$transaction(async (tx) => {
      // Every referenced entity must belong to the acting tenant. Checked here
      // rather than trusting the caller, so a guessed id from another tenant
      // cannot create a cross-tenant mapping.
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, tenantId },
        select: { id: true },
      });
      if (!employee) {
        throw new Error('EMPLOYEE_NOT_IN_TENANT');
      }

      const integration = await tx.attendanceIntegration.findFirst({
        where: { id: integrationId, tenantId },
        select: { id: true, provider: true },
      });
      if (!integration) {
        throw new Error('INTEGRATION_NOT_IN_TENANT');
      }

      if (deviceId) {
        const device = await tx.attendanceDevice.findFirst({
          where: { id: deviceId, tenantId, integrationId },
          select: { id: true },
        });
        if (!device) {
          throw new Error('DEVICE_NOT_IN_TENANT');
        }
      }

      // Retire any previous active identity for this external user.
      await tx.employeeExternalIdentity.updateMany({
        where: {
          tenantId,
          integrationId,
          deviceId,
          externalUserId,
          status: ExternalIdentityStatus.ACTIVE,
          employeeId: { not: employeeId },
        },
        data: {
          status: ExternalIdentityStatus.INACTIVE,
          validTo: new Date(),
          updatedById: input.actorUserId ?? null,
        },
      });

      // Prisma cannot express a compound-unique `where` when one member is
      // null, and an integration-scoped mapping has deviceId = null. Resolved by
      // hand; the partial unique index from Slice 1 guards the race.
      const current = await tx.employeeExternalIdentity.findFirst({
        where: {
          tenantId,
          integrationId,
          deviceId,
          externalUserId,
          employeeId,
        },
        select: { id: true },
      });

      const identity = current
        ? await tx.employeeExternalIdentity.update({
            where: { id: current.id },
            data: {
              employeeId,
              status: ExternalIdentityStatus.ACTIVE,
              mappingSource: input.mappingSource,
              validTo: null,
              updatedById: input.actorUserId ?? null,
            },
          })
        : await tx.employeeExternalIdentity.create({
            data: {
              tenantId,
              employeeId,
              provider: integration.provider,
              integrationId,
              deviceId,
              externalUserId,
              status: ExternalIdentityStatus.ACTIVE,
              mappingSource: input.mappingSource,
              validFrom: new Date(),
              createdById: input.actorUserId ?? null,
              updatedById: input.actorUserId ?? null,
            },
          });

      await tx.externalDeviceUser.updateMany({
        where: { tenantId, integrationId, deviceId, externalUserId },
        data: {
          mappingStatus: ExternalUserMappingStatus.MATCHED,
          mappedEmployeeId: employeeId,
          matchReason: input.mappingSource,
          conflictReason: null,
          updatedById: input.actorUserId ?? null,
        },
      });

      // Attribute punches that arrived before the mapping existed.
      const backfilled = await tx.rawAttendanceEvent.updateMany({
        where: {
          tenantId,
          integrationId,
          ...(deviceId ? { deviceId } : {}),
          externalUserId,
          employeeId: null,
        },
        data: {
          employeeId,
          mappingStatus: 'MAPPED',
        },
      });

      return { identity, backfilledEvents: backfilled.count };
    });
  }

  /** Marks a discovered user as deliberately not a DijiPeople employee. */
  async ignore(input: {
    tenantId: string;
    integrationId: string;
    deviceId?: string | null;
    externalUserId: string;
    actorUserId?: string | null;
  }) {
    return this.prisma.externalDeviceUser.updateMany({
      where: {
        tenantId: input.tenantId,
        integrationId: input.integrationId,
        deviceId: input.deviceId ?? null,
        externalUserId: input.externalUserId.trim(),
      },
      data: {
        mappingStatus: ExternalUserMappingStatus.IGNORED,
        updatedById: input.actorUserId ?? null,
      },
    });
  }

  async unignore(input: {
    tenantId: string;
    integrationId: string;
    deviceId?: string | null;
    externalUserId: string;
    actorUserId?: string | null;
  }) {
    return this.prisma.externalDeviceUser.updateMany({
      where: {
        tenantId: input.tenantId,
        integrationId: input.integrationId,
        deviceId: input.deviceId ?? null,
        externalUserId: input.externalUserId.trim(),
        mappingStatus: ExternalUserMappingStatus.IGNORED,
      },
      data: {
        mappingStatus: ExternalUserMappingStatus.UNMATCHED,
        updatedById: input.actorUserId ?? null,
      },
    });
  }
}
