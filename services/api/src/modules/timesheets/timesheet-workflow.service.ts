import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalModuleKey,
  ApprovalRequestStatus,
  Prisma,
  ProjectResourceStatus,
  TimePayrollInputSourceType,
  TimePayrollInputStatus,
  TimesheetEntryApprovalStatus,
  TimesheetEntrySource,
  TimesheetLockStatus,
  TimesheetPayrollStatus,
  TimesheetReopeningStatus,
  TimesheetStatus,
  TimesheetWeekStatus,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ApprovalMatrixResolverService } from '../approvals/approval-matrix-resolver.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CopyPreviousTimesheetWeekDto,
  RequestTimesheetCorrectionDto,
  SubmitTimesheetWeekDto,
  TimesheetLateSubmissionOverrideDto,
  TimesheetReopeningDecisionDto,
  TimesheetReopeningRequestDto,
  TimesheetWeekDecisionDto,
  TimesheetWeekRejectionDto,
  UpdateTimesheetWeekEntriesDto,
} from './dto/timesheet-week.dto';
import { TimesheetCalculationService } from './timesheet-calculation.service';
import { TimesheetPolicyResolverService } from './timesheet-policy-resolver.service';

const editableWeekStatuses: TimesheetWeekStatus[] = [
  TimesheetWeekStatus.OPEN,
  TimesheetWeekStatus.DRAFT,
  TimesheetWeekStatus.INCOMPLETE,
  TimesheetWeekStatus.READY_TO_SUBMIT,
  TimesheetWeekStatus.REJECTED,
  TimesheetWeekStatus.REOPENED,
  TimesheetWeekStatus.OVERDUE,
];

@Injectable()
export class TimesheetWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyResolver: TimesheetPolicyResolverService,
    private readonly calculationService: TimesheetCalculationService,
    private readonly approvalResolver: ApprovalMatrixResolverService,
    private readonly approvalsService: ApprovalsService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getAccessRestriction(user: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId: user.tenantId, userId: user.userId, isDeleted: false },
      select: { id: true },
    });
    if (!employee) return { item: null };
    const item = await this.prisma.timesheetAccessRestriction.findFirst({
      where: {
        tenantId: user.tenantId,
        employeeId: employee.id,
        isActive: true,
        overriddenAt: null,
        OR: [{ expiryAt: null }, { expiryAt: { gt: new Date() } }],
      },
      orderBy: { startAt: 'desc' },
    });
    return { item };
  }

  async updateWeekEntries(
    user: AuthenticatedUser,
    timesheetId: string,
    weekId: string,
    dto: UpdateTimesheetWeekEntriesDto,
  ) {
    const week = await this.findWeek(user.tenantId, timesheetId, weekId);
    this.assertOwnerOrAdministrator(user, week.timesheet.employee.userId);
    this.assertWeekEditable(week.status, week.lockStatus);
    if (week.version !== dto.weekVersion) {
      throw new ConflictException(
        'This week changed after you opened it. Refresh and try again.',
      );
    }
    const policy = await this.policyResolver.resolveForEmployee(
      user.tenantId,
      week.timesheet.employeeId,
      week.startDate,
    );
    const settings = policy.values;
    const requestedDayIds = new Set(dto.days.map((day) => day.dayId));
    if (requestedDayIds.size !== dto.days.length) {
      throw new BadRequestException(
        'A day can only be included once per save.',
      );
    }
    const dayById = new Map(week.days.map((day) => [day.id, day]));
    const projectAssignmentIds = new Set<string>();
    const projectIds = new Set<string>();

    for (const inputDay of dto.days) {
      const day = dayById.get(inputDay.dayId);
      if (!day)
        throw new BadRequestException('A submitted day is outside this week.');
      if (day.version !== inputDay.version) {
        throw new ConflictException(
          `${dateKey(day.date)} changed after you opened it. Refresh and try again.`,
        );
      }
      if (day.isLocked) {
        throw new ConflictException(
          `${dateKey(day.date)} is locked${day.lockReason ? `: ${day.lockReason}` : '.'}`,
        );
      }
      this.validateDayEntries(day, inputDay.entries, settings);
      inputDay.entries.forEach((entry) => {
        if (entry.projectAssignmentId)
          projectAssignmentIds.add(entry.projectAssignmentId);
        if (entry.projectId) projectIds.add(entry.projectId);
      });
    }

    const assignments =
      projectAssignmentIds.size || projectIds.size
        ? await this.prisma.projectAssignment.findMany({
            where: {
              tenantId: user.tenantId,
              employeeId: week.timesheet.employeeId,
              status: ProjectResourceStatus.ACTIVE,
              OR: [
                ...(projectAssignmentIds.size
                  ? [{ id: { in: [...projectAssignmentIds] } }]
                  : []),
                ...(projectIds.size
                  ? [{ projectId: { in: [...projectIds] } }]
                  : []),
              ],
            },
            include: {
              project: {
                select: {
                  id: true,
                  allowTimesheets: true,
                  status: true,
                  billingType: true,
                },
              },
            },
          })
        : [];
    const assignmentById = new Map(assignments.map((item) => [item.id, item]));
    const assignmentByProjectId = new Map(
      assignments.map((item) => [item.projectId, item]),
    );
    const allowedUnassignedProjects = projectIds.size
      ? await this.prisma.project.findMany({
          where: {
            tenantId: user.tenantId,
            id: { in: [...projectIds] },
            allowTimesheets: true,
            status: { in: ['PLANNING', 'ACTIVE', 'ON_HOLD'] },
          },
          select: { id: true, billingType: true },
        })
      : [];
    const allowedProjectIds = new Set(
      allowedUnassignedProjects.map((item) => item.id),
    );
    const allocationValidation = stringSetting(
      settings,
      'allocationValidation',
      'WARN',
    ).toUpperCase();
    const allowUnassigned = booleanSetting(
      settings,
      'allowUnassignedProjectEntry',
      false,
    );
    for (const inputDay of dto.days) {
      for (const entry of inputDay.entries) {
        if (entry.projectAssignmentId) {
          const assignment = assignmentById.get(entry.projectAssignmentId);
          if (!assignment || assignment.projectId !== entry.projectId) {
            throw new BadRequestException(
              'A selected project assignment is invalid or inactive.',
            );
          }
          const workDate = dayById.get(inputDay.dayId)!.date;
          const outsideAssignmentDates =
            (assignment.startDate &&
              workDate < startOfDay(assignment.startDate)) ||
            (assignment.endDate && workDate > endOfDay(assignment.endDate));
          if (
            !assignment.project.allowTimesheets ||
            !['PLANNING', 'ACTIVE', 'ON_HOLD'].includes(
              assignment.project.status,
            )
          ) {
            throw new BadRequestException(
              'The selected project assignment is not active on this date.',
            );
          }
          if (outsideAssignmentDates && allocationValidation === 'BLOCK') {
            throw new BadRequestException(
              'The selected project assignment is outside its configured dates.',
            );
          }
        } else if (
          entry.projectId &&
          !assignmentByProjectId.has(entry.projectId) &&
          (!allowUnassigned || !allowedProjectIds.has(entry.projectId))
        ) {
          throw new BadRequestException(
            'You are not assigned to the selected project.',
          );
        }
      }
    }

    const before = snapshotWeek(week);
    await this.prisma.$transaction(async (tx) => {
      const changedWeek = await tx.timesheetWeek.updateMany({
        where: {
          id: week.id,
          tenantId: user.tenantId,
          version: dto.weekVersion,
        },
        data: {
          status: TimesheetWeekStatus.DRAFT,
          rejectionReason: null,
          rejectedAt: null,
          version: { increment: 1 },
          updatedById: user.userId,
        },
      });
      if (changedWeek.count !== 1)
        throw new ConflictException('This week was updated concurrently.');

      for (const inputDay of dto.days) {
        const day = dayById.get(inputDay.dayId)!;
        const changedDay = await tx.timesheetDay.updateMany({
          where: {
            id: day.id,
            tenantId: user.tenantId,
            version: inputDay.version,
            isLocked: false,
          },
          data: { version: { increment: 1 }, updatedById: user.userId },
        });
        if (changedDay.count !== 1)
          throw new ConflictException(
            `${dateKey(day.date)} was updated concurrently.`,
          );
        const existingSources = new Map(
          day.entries.map((entry) => [entry.id, entry.source]),
        );
        await tx.timesheetEntry.deleteMany({
          where: { tenantId: user.tenantId, timesheetDayId: day.id },
        });
        if (inputDay.entries.length) {
          await tx.timesheetEntry.createMany({
            data: inputDay.entries.map((entry) => ({
              tenantId: user.tenantId,
              timesheetId,
              timesheetDayId: day.id,
              employeeId: week.timesheet.employeeId,
              date: day.date,
              dayOfWeek: day.dayOfWeek,
              entryType: 'ON_WORK',
              isWeekend: day.isWeekend,
              isHoliday: day.isHoliday,
              leaveRequestId: day.leaveRequestId,
              hours: decimal(entry.hours),
              note: trimOrNull(entry.notes),
              description: trimOrNull(entry.notes),
              projectId: entry.projectId ?? null,
              projectAssignmentId:
                entry.projectAssignmentId ??
                (entry.projectId
                  ? (assignmentByProjectId.get(entry.projectId)?.id ?? null)
                  : null),
              taskId: trimOrNull(entry.taskId),
              activityTypeId: trimOrNull(entry.activityTypeId),
              workLocationId: trimOrNull(entry.workLocationId),
              costCenterId: trimOrNull(entry.costCenterId),
              startTime: entry.startTime ? new Date(entry.startTime) : null,
              endTime: entry.endTime ? new Date(entry.endTime) : null,
              activityCode: trimOrNull(entry.activityCode),
              billableFlag: entry.projectId
                ? (assignmentByProjectId.get(entry.projectId)?.billableFlag ??
                  allowedUnassignedProjects.find(
                    (project) => project.id === entry.projectId,
                  )?.billingType !== 'NON_BILLABLE')
                : false,
              source: entry.id
                ? (existingSources.get(entry.id) ?? TimesheetEntrySource.MANUAL)
                : TimesheetEntrySource.MANUAL,
              approvalStatus: TimesheetEntryApprovalStatus.DRAFT,
              createdById: user.userId,
              updatedById: user.userId,
            })),
          });
        }
      }
      await tx.timesheet.update({
        where: { id: timesheetId },
        data: {
          status: TimesheetStatus.DRAFT,
          submittedAt: null,
          approvedAt: null,
          rejectedAt: null,
          version: { increment: 1 },
          updatedById: user.userId,
        },
      });
      await this.auditService.log(
        {
          tenantId: user.tenantId,
          businessUnitId: week.timesheet.businessUnitId,
          actorUserId: user.userId,
          action: 'TIMESHEET_WEEK_ENTRIES_UPDATED',
          entityType: 'TimesheetWeek',
          entityId: week.id,
          sourceModule: 'timesheets',
          beforeSnapshot: before,
          afterSnapshot: {
            changedDayIds: dto.days.map((day) => day.dayId),
            entryCount: dto.days.reduce(
              (total, day) => total + day.entries.length,
              0,
            ),
          },
        },
        tx,
      );
    });
    return this.calculationService.recalculate(user.tenantId, timesheetId);
  }

  async copyPreviousWeek(
    user: AuthenticatedUser,
    timesheetId: string,
    weekId: string,
    dto: CopyPreviousTimesheetWeekDto,
  ) {
    const week = await this.findWeek(user.tenantId, timesheetId, weekId);
    this.assertOwnerOrAdministrator(user, week.timesheet.employee.userId);
    this.assertWeekEditable(week.status, week.lockStatus);
    if (week.version !== dto.weekVersion) {
      throw new ConflictException(
        'This week changed after you opened it. Refresh and try again.',
      );
    }
    const policy = await this.policyResolver.resolveForEmployee(
      user.tenantId,
      week.timesheet.employeeId,
      week.startDate,
    );
    if (!booleanSetting(policy.values, 'allowCopyPreviousWeek', true)) {
      throw new ForbiddenException(
        'Copying the previous week is disabled by the resolved policy.',
      );
    }
    const previous = await this.prisma.timesheetWeek.findFirst({
      where: {
        tenantId: user.tenantId,
        timesheetId,
        weekNumber: week.weekNumber - 1,
      },
      include: {
        days: { include: { entries: true }, orderBy: { date: 'asc' } },
      },
    });
    if (!previous) {
      throw new BadRequestException('There is no previous week to copy.');
    }
    const hasTargetWork = week.days.some((day) =>
      day.entries.some(
        (entry) =>
          Number(entry.hours) > 0 ||
          Boolean(entry.projectId) ||
          Boolean(entry.note),
      ),
    );
    if (hasTargetWork) {
      throw new ConflictException(
        'Save or remove the existing entries before copying the previous week.',
      );
    }
    const sourceByDay = new Map(
      previous.days.map((day) => [
        day.dayOfWeek,
        day.entries.filter(
          (entry) => Boolean(entry.projectId) && Number(entry.hours) > 0,
        ),
      ]),
    );
    const projectIds = [
      ...new Set(
        [...sourceByDay.values()]
          .flat()
          .flatMap((entry) => (entry.projectId ? [entry.projectId] : [])),
      ),
    ];
    if (!projectIds.length) {
      throw new BadRequestException(
        'The previous week has no project entries to copy.',
      );
    }
    const assignments = await this.prisma.projectAssignment.findMany({
      where: {
        tenantId: user.tenantId,
        employeeId: week.timesheet.employeeId,
        projectId: { in: projectIds },
        status: ProjectResourceStatus.ACTIVE,
      },
      include: {
        project: {
          select: { allowTimesheets: true, status: true },
        },
      },
    });
    const assignmentByProject = new Map(
      assignments.map((assignment) => [assignment.projectId, assignment]),
    );
    const rows: Prisma.TimesheetEntryCreateManyInput[] = [];
    const allocationValidation = stringSetting(
      policy.values,
      'allocationValidation',
      'WARN',
    ).toUpperCase();
    let allocationWarningCount = 0;
    for (const day of week.days) {
      if (day.isLocked) continue;
      for (const source of sourceByDay.get(day.dayOfWeek) ?? []) {
        const assignment = assignmentByProject.get(source.projectId!);
        if (
          !assignment ||
          !assignment.project.allowTimesheets ||
          !['PLANNING', 'ACTIVE', 'ON_HOLD'].includes(assignment.project.status)
        ) {
          throw new BadRequestException(
            'A copied project assignment is not active for the target week.',
          );
        }
        const outsideAssignmentDates =
          (assignment.startDate &&
            day.date < startOfDay(assignment.startDate)) ||
          (assignment.endDate && day.date > endOfDay(assignment.endDate));
        if (outsideAssignmentDates && allocationValidation === 'BLOCK') {
          throw new BadRequestException(
            `The project assignment does not include ${dateKey(day.date)}. Update its dates or change Allocation validation from Block.`,
          );
        }
        if (outsideAssignmentDates && allocationValidation === 'WARN') {
          allocationWarningCount += 1;
        }
        rows.push({
          tenantId: user.tenantId,
          timesheetId,
          timesheetDayId: day.id,
          employeeId: week.timesheet.employeeId,
          date: day.date,
          dayOfWeek: day.dayOfWeek,
          entryType: 'ON_WORK',
          isWeekend: day.isWeekend,
          isHoliday: day.isHoliday,
          hours: source.hours,
          note: source.note,
          description: source.description,
          projectId: source.projectId,
          projectAssignmentId: assignment.id,
          workLocationId: source.workLocationId,
          billableFlag: assignment.billableFlag,
          source: TimesheetEntrySource.MANUAL,
          approvalStatus: TimesheetEntryApprovalStatus.DRAFT,
          createdById: user.userId,
          updatedById: user.userId,
        });
      }
    }
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.timesheetWeek.updateMany({
        where: {
          id: week.id,
          tenantId: user.tenantId,
          version: dto.weekVersion,
        },
        data: {
          status: TimesheetWeekStatus.DRAFT,
          version: { increment: 1 },
          updatedById: user.userId,
        },
      });
      if (changed.count !== 1)
        throw new ConflictException('This week was updated concurrently.');
      await tx.timesheetEntry.deleteMany({
        where: {
          tenantId: user.tenantId,
          timesheetDayId: { in: week.days.map((day) => day.id) },
        },
      });
      if (rows.length) await tx.timesheetEntry.createMany({ data: rows });
      await tx.timesheetDay.updateMany({
        where: {
          tenantId: user.tenantId,
          id: { in: week.days.map((day) => day.id) },
        },
        data: { version: { increment: 1 }, updatedById: user.userId },
      });
      await tx.timesheet.update({
        where: { id: timesheetId },
        data: {
          status: TimesheetStatus.DRAFT,
          version: { increment: 1 },
          updatedById: user.userId,
        },
      });
      await this.auditService.log(
        {
          tenantId: user.tenantId,
          businessUnitId: week.timesheet.businessUnitId,
          actorUserId: user.userId,
          action: 'TIMESHEET_PREVIOUS_WEEK_COPIED',
          entityType: 'TimesheetWeek',
          entityId: week.id,
          sourceModule: 'timesheets',
          afterSnapshot: {
            sourceWeekId: previous.id,
            copiedEntries: rows.length,
            allocationValidation,
            allocationWarningCount,
          },
        },
        tx,
      );
    });
    const recalculated = await this.calculationService.recalculate(
      user.tenantId,
      timesheetId,
    );
    return {
      recalculated,
      warnings:
        allocationWarningCount > 0
          ? [
              `${allocationWarningCount} copied ${allocationWarningCount === 1 ? 'entry falls' : 'entries fall'} outside the employee's project assignment period.`,
            ]
          : [],
    };
  }

  async requestCorrection(
    user: AuthenticatedUser,
    timesheetId: string,
    dto: RequestTimesheetCorrectionDto,
  ) {
    const reason = dto.reason?.trim();
    if (!reason)
      throw new BadRequestException('A correction reason is required.');
    if (
      !user.permissionKeys.includes('timesheets.reject') &&
      !user.permissionKeys.includes('timesheets.reopen') &&
      !user.permissionKeys.includes('timesheets.read.all')
    ) {
      throw new ForbiddenException(
        'You are not allowed to request a timesheet correction.',
      );
    }
    const timesheet = await this.prisma.timesheet.findFirst({
      where: { id: timesheetId, tenantId: user.tenantId },
      include: {
        employee: { select: { userId: true } },
        weeks: { include: { days: { select: { id: true } } } },
      },
    });
    if (!timesheet) throw new NotFoundException('Timesheet was not found.');
    const affected = timesheet.weeks.filter((week) =>
      (
        [
          TimesheetWeekStatus.SUBMITTED,
          TimesheetWeekStatus.PENDING_APPROVAL,
          TimesheetWeekStatus.PARTIALLY_APPROVED,
          TimesheetWeekStatus.APPROVED,
          TimesheetWeekStatus.PAYROLL_READY,
          TimesheetWeekStatus.LOCKED,
        ] as TimesheetWeekStatus[]
      ).includes(week.status),
    );
    if (!affected.length) {
      throw new ConflictException(
        'No submitted or locked week is available for correction.',
      );
    }
    const weekIds = affected.map((week) => week.id);
    const dayIds = affected.flatMap((week) => week.days.map((day) => day.id));
    const approvalIds = affected.flatMap((week) =>
      week.approvalRequestId ? [week.approvalRequestId] : [],
    );
    await this.prisma.$transaction(async (tx) => {
      if (approvalIds.length) {
        await tx.approvalRequest.updateMany({
          where: {
            tenantId: user.tenantId,
            id: { in: approvalIds },
            status: {
              in: [
                ApprovalRequestStatus.PENDING,
                ApprovalRequestStatus.ESCALATED,
              ],
            },
          },
          data: {
            status: ApprovalRequestStatus.RETURNED,
            completedAtUtc: new Date(),
          },
        });
      }
      await tx.timesheetWeek.updateMany({
        where: { tenantId: user.tenantId, id: { in: weekIds } },
        data: {
          status: TimesheetWeekStatus.REOPENED,
          lockStatus: TimesheetLockStatus.UNLOCKED,
          approvalRequestId: null,
          submittedAt: null,
          submittedById: null,
          rejectedAt: new Date(),
          rejectionReason: reason,
          approvalVersion: { increment: 1 },
          payrollEligibility: false,
          version: { increment: 1 },
          updatedById: user.userId,
        },
      });
      await tx.timesheetEntry.updateMany({
        where: { tenantId: user.tenantId, timesheetDayId: { in: dayIds } },
        data: {
          approvalStatus: TimesheetEntryApprovalStatus.DRAFT,
          updatedById: user.userId,
        },
      });
      await tx.timesheet.update({
        where: { id: timesheetId },
        data: {
          status: TimesheetStatus.DRAFT,
          lockStatus: TimesheetLockStatus.UNLOCKED,
          submittedAt: null,
          approvedAt: null,
          rejectedAt: new Date(),
          reviewNote: reason,
          version: { increment: 1 },
          updatedById: user.userId,
        },
      });
      await this.auditService.log(
        {
          tenantId: user.tenantId,
          businessUnitId: timesheet.businessUnitId,
          actorUserId: user.userId,
          action: 'TIMESHEET_CORRECTION_REQUESTED',
          entityType: 'Timesheet',
          entityId: timesheetId,
          sourceModule: 'timesheets',
          afterSnapshot: { reason, reopenedWeekIds: weekIds },
        },
        tx,
      );
    });
    if (timesheet.employee.userId) {
      await this.notificationsService.emit({
        tenantId: user.tenantId,
        eventKey: 'TIMESHEET_REJECTED',
        moduleKey: 'timesheet',
        actorUserId: user.userId,
        relatedEntityType: 'timesheet',
        relatedEntityId: timesheetId,
        metadata: {
          timesheetId,
          candidateUserIds: [timesheet.employee.userId],
          reason,
        },
      });
    }
    return this.calculationService.recalculate(user.tenantId, timesheetId);
  }

  async submitWeek(
    user: AuthenticatedUser,
    timesheetId: string,
    weekId: string,
    dto: SubmitTimesheetWeekDto,
  ) {
    const week = await this.findWeek(user.tenantId, timesheetId, weekId);
    this.assertOwnerOrAdministrator(user, week.timesheet.employee.userId);
    this.assertWeekEditable(week.status, week.lockStatus);
    if (week.version !== dto.weekVersion)
      throw new ConflictException(
        'This week changed. Refresh before submitting.',
      );
    const policy = await this.policyResolver.resolveForEmployee(
      user.tenantId,
      week.timesheet.employeeId,
      week.startDate,
    );
    const settings = policy.values;
    const incomplete = week.days.filter((day) =>
      ['MISSING', 'PARTIAL', 'EXCEPTION'].includes(day.completionStatus),
    );
    if (
      booleanSetting(settings, 'requireAllDaysCompletedBeforeSubmit', true) &&
      incomplete.length
    ) {
      throw new BadRequestException(
        `Complete ${incomplete.map((day) => dateKey(day.date)).join(', ')} before submission.`,
      );
    }
    if (
      booleanSetting(settings, 'requireSubmissionNote', false) &&
      !dto.comment?.trim()
    ) {
      throw new BadRequestException('A submission note is required.');
    }
    const late = Boolean(
      week.submissionDeadline && new Date() > week.submissionDeadline,
    );
    if (
      late &&
      !booleanSetting(settings, 'allowLateSubmission', true) &&
      !week.lateSubmissionOverrideAt
    ) {
      throw new BadRequestException('The submission deadline has passed.');
    }
    if (
      late &&
      booleanSetting(settings, 'requireLateSubmissionReason', true) &&
      !dto.lateReason?.trim()
    ) {
      throw new BadRequestException('A late submission reason is required.');
    }
    const employee = week.timesheet.employee;
    const route = await this.approvalResolver.resolveApprovalRoute({
      tenantId: user.tenantId,
      moduleKey: ApprovalModuleKey.TIMESHEET,
      recordType: 'timesheetWeek',
      effectiveAt: week.endDate,
      requesterEmployee: employee,
      scopeContext: {
        organizationId: employee.organizationId,
        businessUnitId: employee.businessUnitId,
        departmentId: employee.departmentId,
        employeeLevelId: employee.employeeLevelId,
        employeeId: employee.id,
      },
      conditionContext: {
        duration: week.enteredHours.toString(),
        values: {
          weekNumber: week.weekNumber,
          overtimeHours: week.overtimeHours.toString(),
        },
      },
      fallback: [{ type: 'REPORTING_MANAGER' }],
    });
    this.assertApprovalRouteResolved(route, employee, 'submission');
    const workflowEntityId = `${week.id}:v${week.approvalVersion}`;
    const updated = await this.prisma.$transaction(async (tx) => {
      const approval = await this.approvalsService.createWorkflow(
        {
          user,
          moduleKey: 'timesheet',
          entityType: 'timesheetWeek',
          entityId: workflowEntityId,
          requestNumber: `${week.timesheet.year}-${String(week.timesheet.month).padStart(2, '0')}-W${week.weekNumber}`,
          title: `${employee.firstName} ${employee.lastName} · week ${week.weekNumber}`,
          submittedForEmployeeId: employee.id,
          steps: route,
          metadata: {
            source: 'timesheet',
            timesheetId,
            timesheetWeekId: week.id,
            approvalVersion: week.approvalVersion,
            policyId: policy.effectivePolicy?.id ?? null,
            comment: dto.comment?.trim() ?? null,
            lateReason: dto.lateReason?.trim() ?? null,
          },
        },
        tx,
      );
      const now = new Date();
      const changed = await tx.timesheetWeek.updateMany({
        where: {
          id: week.id,
          tenantId: user.tenantId,
          version: dto.weekVersion,
        },
        data: {
          status: TimesheetWeekStatus.PENDING_APPROVAL,
          lockStatus: booleanSetting(settings, 'lockWeekOnSubmission', true)
            ? TimesheetLockStatus.SUBMISSION_LOCKED
            : TimesheetLockStatus.UNLOCKED,
          approvalRequestId: approval.id,
          submittedAt: now,
          submittedById: user.userId,
          rejectionReason: null,
          rejectedAt: null,
          version: { increment: 1 },
          updatedById: user.userId,
        },
      });
      if (changed.count !== 1)
        throw new ConflictException('This week was updated concurrently.');
      await tx.timesheetEntry.updateMany({
        where: {
          tenantId: user.tenantId,
          timesheetDayId: { in: week.days.map((day) => day.id) },
        },
        data: {
          approvalStatus: TimesheetEntryApprovalStatus.PENDING,
          updatedById: user.userId,
        },
      });
      await tx.timesheet.update({
        where: { id: timesheetId },
        data: {
          status: TimesheetStatus.PENDING_APPROVAL,
          submittedAt: now,
          version: { increment: 1 },
          updatedById: user.userId,
        },
      });
      await this.auditService.log(
        {
          tenantId: user.tenantId,
          businessUnitId: week.timesheet.businessUnitId,
          actorUserId: user.userId,
          action: 'TIMESHEET_WEEK_SUBMITTED',
          entityType: 'TimesheetWeek',
          entityId: week.id,
          sourceModule: 'timesheets',
          beforeSnapshot: snapshotWeek(week),
          afterSnapshot: {
            approvalRequestId: approval.id,
            late,
            comment: dto.comment,
            lateReason: dto.lateReason,
          },
        },
        tx,
      );
      return approval;
    });
    await this.notificationsService.emit({
      tenantId: user.tenantId,
      eventKey: 'TIMESHEET_APPROVAL_REQUEST',
      moduleKey: 'timesheet',
      actorUserId: user.userId,
      relatedEntityType: 'timesheetWeek',
      relatedEntityId: workflowEntityId,
      relatedRecordNumber: `${week.timesheet.year}-${week.timesheet.month}-W${week.weekNumber}`,
      metadata: {
        timesheetId,
        timesheetWeekId: week.id,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        candidateUserIds: route.flatMap((step) => step.candidateUserIds),
      },
    });
    return {
      approvalRequestId: updated.id,
      status: TimesheetWeekStatus.PENDING_APPROVAL,
    };
  }

  async grantLateSubmissionOverride(
    user: AuthenticatedUser,
    timesheetId: string,
    weekId: string,
    dto: TimesheetLateSubmissionOverrideDto,
  ) {
    if (!user.permissionKeys.includes('timesheets.override')) {
      throw new ForbiddenException(
        'You do not have permission to override a submission deadline.',
      );
    }
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException('An override reason is required.');
    }
    const week = await this.findWeek(user.tenantId, timesheetId, weekId);
    if (week.version !== dto.weekVersion) {
      throw new ConflictException(
        'This week changed. Refresh before granting the override.',
      );
    }
    if (!week.submissionDeadline || new Date() <= week.submissionDeadline) {
      throw new BadRequestException(
        'This week has not passed its submission deadline.',
      );
    }
    if (!editableWeekStatuses.includes(week.status)) {
      throw new ConflictException(
        'A late-submission override is not available for this week status.',
      );
    }
    const policy = await this.policyResolver.resolveForEmployee(
      user.tenantId,
      week.timesheet.employeeId,
      week.startDate,
    );
    if (
      !booleanSetting(policy.values, 'allowPayrollLateSubmissionOverride', true)
    ) {
      throw new ForbiddenException(
        'Payroll late-submission overrides are disabled in the resolved timesheet settings.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.timesheetWeek.updateMany({
        where: {
          id: week.id,
          tenantId: user.tenantId,
          version: dto.weekVersion,
        },
        data: {
          lateSubmissionOverrideAt: new Date(),
          lateSubmissionOverrideById: user.userId,
          lateSubmissionOverrideReason: reason,
          version: { increment: 1 },
          updatedById: user.userId,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException(
          'This week changed. Refresh before granting the override.',
        );
      }
      await this.auditService.log(
        {
          tenantId: user.tenantId,
          businessUnitId: week.timesheet.businessUnitId,
          actorUserId: user.userId,
          action: 'TIMESHEET_LATE_SUBMISSION_OVERRIDE_GRANTED',
          entityType: 'TimesheetWeek',
          entityId: week.id,
          sourceModule: 'timesheets',
          afterSnapshot: {
            submissionDeadline: week.submissionDeadline,
            reason,
            policyId: policy.effectivePolicy?.id ?? null,
          },
        },
        tx,
      );
    });
    return this.calculationService.recalculate(user.tenantId, timesheetId);
  }

  async decideWeek(
    user: AuthenticatedUser,
    timesheetId: string,
    weekId: string,
    action: 'APPROVED' | 'REJECTED',
    dto: TimesheetWeekDecisionDto | TimesheetWeekRejectionDto,
  ) {
    const week = await this.findWeek(user.tenantId, timesheetId, weekId);
    if (
      !week.approvalRequestId ||
      week.status !== TimesheetWeekStatus.PENDING_APPROVAL
    ) {
      throw new ConflictException('This week is not pending approval.');
    }
    const comment =
      action === 'REJECTED'
        ? (dto as TimesheetWeekRejectionDto).reason
        : (dto as TimesheetWeekDecisionDto).comment;
    if (action === 'REJECTED' && !comment?.trim())
      throw new BadRequestException('A rejection reason is required.');
    const result = await this.prisma.$transaction(async (tx) => {
      const approval = await this.approvalsService.action(
        { user, approvalRequestId: week.approvalRequestId!, action, comment },
        tx,
      );
      let nextStatus: TimesheetWeekStatus =
        TimesheetWeekStatus.PENDING_APPROVAL;
      let lockStatus = week.lockStatus;
      if (approval.status === ApprovalRequestStatus.REJECTED) {
        nextStatus = TimesheetWeekStatus.REJECTED;
        lockStatus = TimesheetLockStatus.UNLOCKED;
      } else if (approval.status === ApprovalRequestStatus.APPROVED) {
        nextStatus = TimesheetWeekStatus.APPROVED;
        const policy = await this.policyResolver.resolveForEmployee(
          user.tenantId,
          week.timesheet.employeeId,
          week.endDate,
        );
        lockStatus = booleanSetting(policy.values, 'lockWeekOnApproval', true)
          ? TimesheetLockStatus.APPROVAL_LOCKED
          : TimesheetLockStatus.UNLOCKED;
      } else {
        nextStatus = TimesheetWeekStatus.PARTIALLY_APPROVED;
      }
      await tx.timesheetWeek.update({
        where: { id: week.id },
        data: {
          status: nextStatus,
          lockStatus,
          rejectedAt:
            nextStatus === TimesheetWeekStatus.REJECTED ? new Date() : null,
          rejectionReason:
            nextStatus === TimesheetWeekStatus.REJECTED
              ? comment!.trim()
              : null,
          approvalVersion:
            nextStatus === TimesheetWeekStatus.REJECTED
              ? { increment: 1 }
              : undefined,
          payrollEligibility: nextStatus === TimesheetWeekStatus.APPROVED,
          version: { increment: 1 },
          updatedById: user.userId,
        },
      });
      await tx.timesheetEntry.updateMany({
        where: {
          tenantId: user.tenantId,
          timesheetDayId: { in: week.days.map((day) => day.id) },
        },
        data: {
          approvalStatus:
            nextStatus === TimesheetWeekStatus.APPROVED
              ? TimesheetEntryApprovalStatus.APPROVED
              : nextStatus === TimesheetWeekStatus.REJECTED
                ? TimesheetEntryApprovalStatus.REJECTED
                : TimesheetEntryApprovalStatus.PENDING,
          updatedById: user.userId,
        },
      });
      await this.reconcileMonthlyStatus(tx, user, timesheetId);
      await this.auditService.log(
        {
          tenantId: user.tenantId,
          businessUnitId: week.timesheet.businessUnitId,
          actorUserId: user.userId,
          action: `TIMESHEET_WEEK_${action}`,
          entityType: 'TimesheetWeek',
          entityId: week.id,
          sourceModule: 'timesheets',
          beforeSnapshot: snapshotWeek(week),
          afterSnapshot: {
            status: nextStatus,
            approvalRequestStatus: approval.status,
            comment,
          },
        },
        tx,
      );
      return { status: nextStatus, approvalRequestStatus: approval.status };
    });
    await this.calculationService.recalculate(user.tenantId, timesheetId);
    if (result.status === TimesheetWeekStatus.REJECTED) {
      await this.notificationsService.emit({
        tenantId: user.tenantId,
        eventKey: 'TIMESHEET_REJECTED',
        moduleKey: 'timesheet',
        actorUserId: user.userId,
        relatedEntityType: 'timesheetWeek',
        relatedEntityId: week.id,
        metadata: {
          timesheetId,
          timesheetWeekId: week.id,
          candidateUserIds: [week.timesheet.employee.userId],
          reason: comment,
        },
      });
    }
    return result;
  }

  async withdrawWeek(
    user: AuthenticatedUser,
    timesheetId: string,
    weekId: string,
    dto: TimesheetWeekDecisionDto,
  ) {
    const week = await this.findWeek(user.tenantId, timesheetId, weekId);
    if (
      !week.approvalRequestId ||
      !(
        [
          TimesheetWeekStatus.PENDING_APPROVAL,
          TimesheetWeekStatus.PARTIALLY_APPROVED,
        ] as TimesheetWeekStatus[]
      ).includes(week.status)
    ) {
      throw new ConflictException(
        'Only a week awaiting approval can be withdrawn.',
      );
    }
    const policy = await this.policyResolver.resolveForEmployee(
      user.tenantId,
      week.timesheet.employeeId,
      week.endDate,
    );
    if (!booleanSetting(policy.values, 'allowWithdrawalBeforeApproval', true)) {
      throw new ForbiddenException(
        'Withdrawal is disabled by the resolved timesheet policy.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await this.approvalsService.cancel(
        {
          user,
          approvalRequestId: week.approvalRequestId!,
          comment: dto.comment,
        },
        tx,
      );
      await tx.timesheetWeek.update({
        where: { id: week.id },
        data: {
          status: TimesheetWeekStatus.DRAFT,
          lockStatus: TimesheetLockStatus.UNLOCKED,
          approvalRequestId: null,
          submittedAt: null,
          submittedById: null,
          approvalVersion: { increment: 1 },
          version: { increment: 1 },
          updatedById: user.userId,
        },
      });
      await tx.timesheetEntry.updateMany({
        where: {
          tenantId: user.tenantId,
          timesheetDayId: { in: week.days.map((day) => day.id) },
        },
        data: {
          approvalStatus: TimesheetEntryApprovalStatus.DRAFT,
          updatedById: user.userId,
        },
      });
      await this.reconcileMonthlyStatus(tx, user, timesheetId);
    });
    return { status: TimesheetWeekStatus.DRAFT };
  }

  async getApprovalTracker(
    user: AuthenticatedUser,
    timesheetId: string,
    weekId: string,
  ) {
    const week = await this.findWeek(user.tenantId, timesheetId, weekId);
    this.assertCanRead(
      user,
      week.timesheet.employee.userId,
      week.timesheet.employee.manager?.userId,
    );
    const history = await this.prisma.approvalRequest.findMany({
      where: {
        tenantId: user.tenantId,
        moduleKey: 'timesheet',
        entityType: 'timesheetWeek',
        entityId: { startsWith: `${week.id}:v` },
      },
      select: {
        id: true,
        entityId: true,
        status: true,
        submittedAtUtc: true,
        completedAtUtc: true,
      },
      orderBy: { createdAtUtc: 'desc' },
    });
    if (!week.approvalRequestId) return { item: null, history };
    const detail = await this.approvalsService.detail(
      user,
      week.approvalRequestId,
    );
    return { ...detail, history };
  }

  async requestReopening(
    user: AuthenticatedUser,
    timesheetId: string,
    weekId: string,
    dto: TimesheetReopeningRequestDto,
  ) {
    const week = await this.findWeek(user.tenantId, timesheetId, weekId);
    this.assertOwnerOrAdministrator(user, week.timesheet.employee.userId);
    if (
      !(
        [
          TimesheetWeekStatus.APPROVED,
          TimesheetWeekStatus.PAYROLL_READY,
          TimesheetWeekStatus.PAYROLL_PROCESSED,
          TimesheetWeekStatus.LOCKED,
        ] as TimesheetWeekStatus[]
      ).includes(week.status)
    ) {
      throw new ConflictException(
        'Only an approved or locked week can be reopened.',
      );
    }
    const policy = await this.policyResolver.resolveForEmployee(
      user.tenantId,
      week.timesheet.employeeId,
      week.endDate,
    );
    this.assertCanRequestReopening(user, week, policy.values);
    if (
      booleanSetting(policy.values, 'preventReopenAfterPayroll', true) &&
      (week.status === TimesheetWeekStatus.PAYROLL_PROCESSED ||
        week.lockStatus === TimesheetLockStatus.PAYROLL_LOCKED)
    ) {
      throw new ConflictException(
        'This week has already been exported to payroll.',
      );
    }
    const cutoffDays = numberSetting(
      policy.values,
      'maximumReopeningPeriodDays',
      30,
    );
    if (daysBetween(week.endDate, new Date()) > cutoffDays) {
      throw new BadRequestException(
        `The reopening window of ${cutoffDays} days has passed.`,
      );
    }
    const existing = await this.prisma.timesheetReopeningRequest.findFirst({
      where: {
        tenantId: user.tenantId,
        weekId,
        status: TimesheetReopeningStatus.PENDING,
      },
    });
    if (existing)
      throw new ConflictException(
        'A reopening request is already pending for this week.',
      );
    const employee = week.timesheet.employee;
    const route = await this.approvalResolver.resolveApprovalRoute({
      tenantId: user.tenantId,
      moduleKey: ApprovalModuleKey.TIMESHEET,
      recordType: 'timesheetReopening',
      effectiveAt: new Date(),
      requesterEmployee: employee,
      scopeContext: {
        organizationId: employee.organizationId,
        businessUnitId: employee.businessUnitId,
        departmentId: employee.departmentId,
        employeeLevelId: employee.employeeLevelId,
        employeeId: employee.id,
      },
      conditionContext: { values: { timesheetId, weekId, reopening: true } },
      fallback: [{ type: 'REPORTING_MANAGER' }],
    });
    this.assertApprovalRouteResolved(route, employee, 'reopening request');
    const created = await this.prisma.$transaction(async (tx) => {
      const reopening = await tx.timesheetReopeningRequest.create({
        data: {
          tenantId: user.tenantId,
          timesheetId,
          weekId,
          requestedById: user.userId,
          reason: dto.reason.trim(),
          previousWeekStatus: week.status,
        },
      });
      const approval = await this.approvalsService.createWorkflow(
        {
          user,
          moduleKey: 'timesheet',
          entityType: 'timesheetReopening',
          entityId: reopening.id,
          title: `Reopen ${employee.firstName} ${employee.lastName} · week ${week.weekNumber}`,
          submittedForEmployeeId: employee.id,
          steps: route,
          metadata: {
            source: 'timesheet-reopening',
            timesheetId,
            timesheetWeekId: weekId,
            reopeningRequestId: reopening.id,
            reason: dto.reason.trim(),
          },
        },
        tx,
      );
      await tx.timesheetWeek.update({
        where: { id: week.id },
        data: {
          status: TimesheetWeekStatus.REOPENING_REQUESTED,
          version: { increment: 1 },
          updatedById: user.userId,
        },
      });
      return tx.timesheetReopeningRequest.update({
        where: { id: reopening.id },
        data: { approvalRequestId: approval.id },
      });
    });
    await this.auditService.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'TIMESHEET_REOPENING_REQUESTED',
      entityType: 'TimesheetReopeningRequest',
      entityId: created.id,
      sourceModule: 'timesheets',
      afterSnapshot: created,
    });
    return created;
  }

  async decideReopening(
    user: AuthenticatedUser,
    timesheetId: string,
    weekId: string,
    requestId: string,
    dto: TimesheetReopeningDecisionDto,
  ) {
    if (
      !user.permissionKeys.includes('timesheets.approve') &&
      !user.permissionKeys.includes('timesheets.read.all')
    ) {
      throw new ForbiddenException(
        'You are not allowed to decide reopening requests.',
      );
    }
    const week = await this.findWeek(user.tenantId, timesheetId, weekId);
    const request = await this.prisma.timesheetReopeningRequest.findFirst({
      where: { id: requestId, tenantId: user.tenantId, timesheetId, weekId },
    });
    if (!request)
      throw new NotFoundException('Reopening request was not found.');
    if (request.status !== TimesheetReopeningStatus.PENDING)
      throw new ConflictException('This request has already been decided.');
    if (!dto.approve && !dto.reason?.trim())
      throw new BadRequestException('A rejection reason is required.');
    if (!request.approvalRequestId)
      throw new ConflictException(
        'This reopening request has no approval workflow.',
      );
    const now = new Date();
    const outcome = await this.prisma.$transaction(async (tx) => {
      const approval = await this.approvalsService.action(
        {
          user,
          approvalRequestId: request.approvalRequestId!,
          action: dto.approve ? 'APPROVED' : 'REJECTED',
          comment: dto.reason,
        },
        tx,
      );
      if (approval.status === ApprovalRequestStatus.PENDING) {
        return { status: TimesheetReopeningStatus.PENDING };
      }
      const approved = approval.status === ApprovalRequestStatus.APPROVED;
      await tx.timesheetReopeningRequest.update({
        where: { id: request.id },
        data: {
          status: approved
            ? TimesheetReopeningStatus.APPROVED
            : TimesheetReopeningStatus.REJECTED,
          approverUserId: user.userId,
          approvedAt: approved ? now : null,
          rejectedAt: approved ? null : now,
          decisionReason: trimOrNull(dto.reason),
        },
      });
      if (approved) {
        await tx.timesheetWeek.update({
          where: { id: week.id },
          data: {
            status: TimesheetWeekStatus.REOPENED,
            lockStatus: TimesheetLockStatus.UNLOCKED,
            approvalRequestId: null,
            reopenedAt: now,
            approvalVersion: { increment: 1 },
            version: { increment: 1 },
            payrollEligibility: false,
            updatedById: user.userId,
          },
        });
        await tx.timesheet.update({
          where: { id: timesheetId },
          data: {
            status: TimesheetStatus.IN_PROGRESS,
            approvedAt: null,
            payrollStatus: TimesheetPayrollStatus.ADJUSTMENT_REQUIRED,
            version: { increment: 1 },
            updatedById: user.userId,
          },
        });
      } else {
        await tx.timesheetWeek.update({
          where: { id: week.id },
          data: {
            status: request.previousWeekStatus ?? TimesheetWeekStatus.APPROVED,
            version: { increment: 1 },
            updatedById: user.userId,
          },
        });
      }
      await this.auditService.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: approved
            ? 'TIMESHEET_REOPENING_APPROVED'
            : 'TIMESHEET_REOPENING_REJECTED',
          entityType: 'TimesheetReopeningRequest',
          entityId: request.id,
          sourceModule: 'timesheets',
          beforeSnapshot: request,
          afterSnapshot: {
            approve: approved,
            reason: dto.reason,
            approvalRequestStatus: approval.status,
          },
        },
        tx,
      );
      return {
        status: approved
          ? TimesheetReopeningStatus.APPROVED
          : TimesheetReopeningStatus.REJECTED,
      };
    });
    if (outcome.status === TimesheetReopeningStatus.APPROVED) {
      await this.notificationsService.emit({
        tenantId: user.tenantId,
        eventKey: 'TIMESHEET_REOPENED',
        moduleKey: 'timesheet',
        actorUserId: user.userId,
        relatedEntityType: 'timesheetWeek',
        relatedEntityId: week.id,
        metadata: {
          timesheetId,
          timesheetWeekId: week.id,
          reopeningRequestId: request.id,
          candidateUserIds: [week.timesheet.employee.userId],
        },
      });
    }
    return outcome;
  }

  async handoffToPayroll(user: AuthenticatedUser, timesheetId: string) {
    const timesheet = await this.prisma.timesheet.findFirst({
      where: { id: timesheetId, tenantId: user.tenantId },
      include: {
        employee: { select: { userId: true } },
        weeks: { include: { days: { include: { entries: true } } } },
      },
    });
    if (!timesheet) throw new NotFoundException('Timesheet was not found.');
    const policy = await this.policyResolver.resolveForEmployee(
      user.tenantId,
      timesheet.employeeId,
      timesheet.periodEnd,
    );
    if (
      stringSetting(policy.values, 'payrollUsage', 'NOT_USED') === 'NOT_USED'
    ) {
      throw new BadRequestException(
        'Payroll integration is disabled by the resolved timesheet policy.',
      );
    }
    if (timesheet.payrollStatus !== TimesheetPayrollStatus.READY) {
      throw new ConflictException(
        `Timesheet payroll readiness is ${timesheet.payrollStatus}.`,
      );
    }
    const includedWeeks = timesheet.weeks.filter((week) =>
      (
        [
          TimesheetWeekStatus.APPROVED,
          TimesheetWeekStatus.PAYROLL_READY,
        ] as TimesheetWeekStatus[]
      ).includes(week.status),
    );
    if (
      !includedWeeks.length ||
      includedWeeks.length !==
        timesheet.weeks.filter((week) => week.requiredHours.gt(0)).length
    ) {
      throw new ConflictException(
        'Every required week must be approved before payroll handoff.',
      );
    }
    const entries = includedWeeks.flatMap((week) =>
      week.days.flatMap((day) =>
        day.entries.map((entry) => ({ week, day, entry })),
      ),
    );
    const executionKey = `${timesheet.id}:v${timesheet.version}`;
    const existing = await this.prisma.timesheetPayrollHandoff.findUnique({
      where: {
        tenantId_executionKey: { tenantId: user.tenantId, executionKey },
      },
    });
    if (existing?.status === TimesheetPayrollStatus.EXPORTED) return existing;
    const completed = await this.prisma.$transaction(async (tx) => {
      const handoff = await tx.timesheetPayrollHandoff.upsert({
        where: {
          tenantId_executionKey: { tenantId: user.tenantId, executionKey },
        },
        create: {
          tenantId: user.tenantId,
          timesheetId,
          executionKey,
          includedWeekIds: includedWeeks.map((week) => week.id),
          includedEntryIds: entries.map(({ entry }) => entry.id),
          status: TimesheetPayrollStatus.EXPORT_PENDING,
          authorizedById: user.userId,
        },
        update: {
          status: TimesheetPayrollStatus.EXPORT_PENDING,
          retryCount: { increment: 1 },
          failureReason: null,
          authorizedById: user.userId,
        },
      });
      for (const { day, entry } of entries) {
        const overtime =
          entry.payrollCategory === 'OVERTIME' ||
          (day.isWeekend &&
            booleanSetting(
              policy.values,
              'includeWeekendHoursInPayroll',
              true,
            ));
        const source = await tx.timePayrollInput.findFirst({
          where: {
            tenantId: user.tenantId,
            sourceType: TimePayrollInputSourceType.TIMESHEET,
            sourceId: entry.id,
          },
        });
        const data = {
          employeeId: timesheet.employeeId,
          workDate: entry.date,
          regularHours: decimal(overtime ? 0 : entry.hours.toString()),
          overtimeHours: decimal(overtime ? entry.hours.toString() : 0),
          absenceDays: decimal(0),
          status: TimePayrollInputStatus.PREPARED,
          metadata: {
            timesheetId,
            weekId: day.timesheetWeekId,
            dayId: day.id,
            handoffId: handoff.id,
            projectId: entry.projectId,
            costCenterId: entry.costCenterId,
            billable: entry.billableFlag,
            payrollCategory: entry.payrollCategory,
          },
        };
        if (source)
          await tx.timePayrollInput.update({ where: { id: source.id }, data });
        else
          await tx.timePayrollInput.create({
            data: {
              tenantId: user.tenantId,
              sourceType: TimePayrollInputSourceType.TIMESHEET,
              sourceId: entry.id,
              ...data,
            },
          });
      }
      await tx.timesheetWeek.updateMany({
        where: {
          id: { in: includedWeeks.map((week) => week.id) },
          tenantId: user.tenantId,
        },
        data: {
          status: TimesheetWeekStatus.PAYROLL_PROCESSED,
          lockStatus: TimesheetLockStatus.PAYROLL_LOCKED,
          version: { increment: 1 },
          updatedById: user.userId,
        },
      });
      await tx.timesheet.update({
        where: { id: timesheetId },
        data: {
          status: TimesheetStatus.PAYROLL_PROCESSED,
          payrollStatus: TimesheetPayrollStatus.EXPORTED,
          version: { increment: 1 },
          updatedById: user.userId,
        },
      });
      const completed = await tx.timesheetPayrollHandoff.update({
        where: { id: handoff.id },
        data: {
          status: TimesheetPayrollStatus.EXPORTED,
          exportedAt: new Date(),
          payrollReference: `TIMESHEET-${timesheet.year}-${String(timesheet.month).padStart(2, '0')}`,
          result: { inputsCreatedOrUpdated: entries.length },
        },
      });
      await this.auditService.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: 'TIMESHEET_PAYROLL_HANDOFF_COMPLETED',
          entityType: 'TimesheetPayrollHandoff',
          entityId: completed.id,
          sourceModule: 'timesheets',
          afterSnapshot: { executionKey, inputCount: entries.length },
        },
        tx,
      );
      return completed;
    });
    await this.notificationsService.emit({
      tenantId: user.tenantId,
      eventKey: 'TIMESHEET_PAYROLL_EXPORTED',
      moduleKey: 'timesheet',
      actorUserId: user.userId,
      relatedEntityType: 'timesheetPayrollHandoff',
      relatedEntityId: completed.id,
      metadata: {
        timesheetId,
        candidateUserIds: [timesheet.employee.userId],
        payrollReference: completed.payrollReference,
      },
    });
    return completed;
  }

  private async findWeek(
    tenantId: string,
    timesheetId: string,
    weekId: string,
  ) {
    const week = await this.prisma.timesheetWeek.findFirst({
      where: { id: weekId, tenantId, timesheetId },
      include: {
        timesheet: {
          include: {
            employee: {
              select: {
                id: true,
                userId: true,
                firstName: true,
                lastName: true,
                managerEmployeeId: true,
                organizationId: true,
                businessUnitId: true,
                departmentId: true,
                employeeLevelId: true,
                manager: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    userId: true,
                    user: { select: { status: true } },
                  },
                },
              },
            },
          },
        },
        days: { include: { entries: true }, orderBy: { date: 'asc' } },
      },
    });
    if (!week) throw new NotFoundException('Timesheet week was not found.');
    return week;
  }

  private assertApprovalRouteResolved(
    route: Array<unknown>,
    employee: {
      firstName: string;
      lastName: string;
      manager?: {
        firstName: string;
        lastName: string;
        userId: string | null;
        user?: { status: string } | null;
      } | null;
    },
    action: 'submission' | 'reopening request',
  ) {
    if (route.length > 0) return;

    const employeeName = `${employee.firstName} ${employee.lastName}`.trim();
    const manager = employee.manager;
    if (!manager) {
      throw new BadRequestException(
        `Timesheet ${action} cannot continue because ${employeeName} has no reporting manager assigned. Assign a reporting manager with an active user account, or configure an active Timesheet approval matrix.`,
      );
    }

    const managerName = `${manager.firstName} ${manager.lastName}`.trim();
    if (!manager.userId) {
      throw new BadRequestException(
        `Timesheet ${action} cannot continue because reporting manager ${managerName} has no linked active user account. Link or invite the manager under Users, or configure an active Timesheet approval matrix.`,
      );
    }
    if (manager.user?.status && manager.user.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Timesheet ${action} cannot continue because reporting manager ${managerName}'s user account is not active. Activate the account, or configure an active Timesheet approval matrix.`,
      );
    }

    throw new BadRequestException(
      `Timesheet ${action} cannot continue because no active approval route matches ${employeeName} for this period. Configure a matching Timesheet approval matrix or verify the reporting manager account.`,
    );
  }

  private assertOwnerOrAdministrator(
    user: AuthenticatedUser,
    ownerUserId: string | null,
  ) {
    if (
      ownerUserId === user.userId ||
      user.permissionKeys.includes('timesheets.read.all')
    )
      return;
    throw new ForbiddenException(
      'You cannot change another employee’s timesheet.',
    );
  }

  private assertCanRead(
    user: AuthenticatedUser,
    ownerUserId: string | null,
    managerUserId?: string | null,
  ) {
    if (
      ownerUserId === user.userId ||
      managerUserId === user.userId ||
      user.permissionKeys.includes('timesheets.read.all')
    )
      return;
    throw new ForbiddenException('You cannot view this approval workflow.');
  }

  private assertCanRequestReopening(
    user: AuthenticatedUser,
    week: Awaited<ReturnType<TimesheetWorkflowService['findWeek']>>,
    settings: Record<string, unknown>,
  ) {
    const employee = week.timesheet.employee;
    const allowed =
      user.permissionKeys.includes('timesheets.read.all') ||
      (employee.userId === user.userId &&
        booleanSetting(settings, 'allowEmployeeReopeningRequest', true)) ||
      (employee.manager?.userId === user.userId &&
        booleanSetting(settings, 'allowManagerReopeningRequest', true)) ||
      (user.permissionKeys.includes('timesheets.read.hr') &&
        booleanSetting(settings, 'allowHrReopening', true)) ||
      (user.permissionKeys.includes('timesheets.read.payroll') &&
        booleanSetting(settings, 'allowPayrollReopening', false));
    if (!allowed)
      throw new ForbiddenException(
        'The resolved policy does not allow you to request reopening.',
      );
  }

  private assertWeekEditable(
    status: TimesheetWeekStatus,
    lockStatus: TimesheetLockStatus,
  ) {
    if (
      !editableWeekStatuses.includes(status) ||
      lockStatus !== TimesheetLockStatus.UNLOCKED
    ) {
      throw new ConflictException(
        `Week ${status.toLowerCase()} is not editable.`,
      );
    }
  }

  private validateDayEntries(
    day: {
      date: Date;
      availableHours: Prisma.Decimal;
      attendanceHours: Prisma.Decimal;
    },
    entries: UpdateTimesheetWeekEntriesDto['days'][number]['entries'],
    settings: Record<string, unknown>,
  ) {
    const incrementMinutes = Math.max(
      1,
      numberSetting(settings, 'entryMinuteIncrement', 15),
    );
    const minimumMinutes = Math.max(
      1,
      numberSetting(settings, 'minimumEntryMinutes', 15),
    );
    const maximumHours = numberSetting(settings, 'maximumHoursPerDay', 24);
    const requireProject = booleanSetting(settings, 'requireProject', false);
    const requireTask = booleanSetting(settings, 'requireTask', false);
    const requireCostCenter = booleanSetting(
      settings,
      'requireCostCenter',
      false,
    );
    const requireNotes = booleanSetting(settings, 'requireEntryNotes', false);
    const requireNotesOver = numberSetting(
      settings,
      'requireNotesOverHours',
      12,
    );
    let total = 0;
    const ranges: Array<{ start: number; end: number }> = [];
    for (const entry of entries) {
      const hours = Number(entry.hours);
      const minutes = Math.round(hours * 60);
      if (
        !Number.isFinite(hours) ||
        hours <= 0 ||
        minutes < minimumMinutes ||
        minutes % incrementMinutes !== 0
      ) {
        throw new BadRequestException(
          `${dateKey(day.date)} entries must be at least ${minimumMinutes} minutes in ${incrementMinutes}-minute increments.`,
        );
      }
      if (requireProject && !entry.projectId)
        throw new BadRequestException(
          `A project is required on ${dateKey(day.date)}.`,
        );
      if (requireTask && !entry.taskId?.trim())
        throw new BadRequestException(
          `A task is required on ${dateKey(day.date)}.`,
        );
      if (requireCostCenter && !entry.costCenterId?.trim())
        throw new BadRequestException(
          `A cost center is required on ${dateKey(day.date)}.`,
        );
      if ((requireNotes || hours > requireNotesOver) && !entry.notes?.trim())
        throw new BadRequestException(
          `Notes are required on ${dateKey(day.date)}.`,
        );
      if (entry.startTime || entry.endTime) {
        if (!entry.startTime || !entry.endTime)
          throw new BadRequestException(
            'Both start and end time are required.',
          );
        const start = new Date(entry.startTime);
        const end = new Date(entry.endTime);
        if (
          !Number.isFinite(start.getTime()) ||
          !Number.isFinite(end.getTime()) ||
          end <= start
        )
          throw new BadRequestException(
            'Entry end time must be after start time.',
          );
        if (
          dateKey(start) !== dateKey(day.date) ||
          dateKey(end) !== dateKey(day.date)
        )
          throw new BadRequestException(
            'Entry times must fall on the timesheet day.',
          );
        ranges.push({ start: start.getTime(), end: end.getTime() });
      }
      total += hours;
    }
    if (total > maximumHours)
      throw new BadRequestException(
        `${dateKey(day.date)} exceeds the ${maximumHours}-hour daily limit.`,
      );
    if (
      booleanSetting(settings, 'preventHoursAboveAttendance', false) &&
      Number(day.attendanceHours) > 0 &&
      total > Number(day.attendanceHours)
    )
      throw new BadRequestException(
        `${dateKey(day.date)} exceeds recorded attendance hours.`,
      );
    if (booleanSetting(settings, 'preventOverlappingEntries', true)) {
      ranges.sort((left, right) => left.start - right.start);
      for (let index = 1; index < ranges.length; index += 1) {
        if (ranges[index].start < ranges[index - 1].end)
          throw new BadRequestException(
            `${dateKey(day.date)} contains overlapping time entries.`,
          );
      }
    }
  }

  private async reconcileMonthlyStatus(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    timesheetId: string,
  ) {
    const weeks = await tx.timesheetWeek.findMany({
      where: { tenantId: user.tenantId, timesheetId },
      select: { status: true, requiredHours: true },
    });
    const required = weeks.filter((week) => week.requiredHours.gt(0));
    const allAre = (states: TimesheetWeekStatus[]) =>
      required.length > 0 &&
      required.every((week) => states.includes(week.status));
    const anyAre = (states: TimesheetWeekStatus[]) =>
      required.some((week) => states.includes(week.status));
    let status: TimesheetStatus;
    if (required.length === 0) status = TimesheetStatus.NOT_REQUIRED;
    else if (anyAre([TimesheetWeekStatus.REJECTED]))
      status = TimesheetStatus.REJECTED;
    else if (allAre([TimesheetWeekStatus.PAYROLL_PROCESSED]))
      status = TimesheetStatus.PAYROLL_PROCESSED;
    else if (
      allAre([
        TimesheetWeekStatus.APPROVED,
        TimesheetWeekStatus.PAYROLL_READY,
        TimesheetWeekStatus.PAYROLL_PROCESSED,
      ])
    )
      status = TimesheetStatus.PAYROLL_READY;
    else if (
      anyAre([
        TimesheetWeekStatus.APPROVED,
        TimesheetWeekStatus.PARTIALLY_APPROVED,
      ])
    )
      status = TimesheetStatus.PARTIALLY_APPROVED;
    else if (
      anyAre([
        TimesheetWeekStatus.PENDING_APPROVAL,
        TimesheetWeekStatus.SUBMITTED,
      ])
    )
      status = TimesheetStatus.PENDING_APPROVAL;
    else if (anyAre([TimesheetWeekStatus.OVERDUE]))
      status = TimesheetStatus.OVERDUE;
    else if (
      anyAre([
        TimesheetWeekStatus.DRAFT,
        TimesheetWeekStatus.INCOMPLETE,
        TimesheetWeekStatus.READY_TO_SUBMIT,
        TimesheetWeekStatus.REOPENED,
        TimesheetWeekStatus.REOPENING_REQUESTED,
      ])
    )
      status = TimesheetStatus.IN_PROGRESS;
    else status = TimesheetStatus.NOT_STARTED;
    await tx.timesheet.update({
      where: { id: timesheetId },
      data: {
        status,
        approvedAt:
          status === TimesheetStatus.PAYROLL_READY ||
          status === TimesheetStatus.PAYROLL_PROCESSED
            ? new Date()
            : null,
        rejectedAt: status === TimesheetStatus.REJECTED ? new Date() : null,
        version: { increment: 1 },
        updatedById: user.userId,
      },
    });
  }
}

function snapshotWeek(week: {
  status: TimesheetWeekStatus;
  lockStatus: TimesheetLockStatus;
  version: number;
  enteredHours: Prisma.Decimal;
  approvalRequestId: string | null;
}) {
  return {
    status: week.status,
    lockStatus: week.lockStatus,
    version: week.version,
    enteredHours: week.enteredHours.toString(),
    approvalRequestId: week.approvalRequestId,
  };
}
function decimal(value: string | number) {
  return new Prisma.Decimal(value);
}
function trimOrNull(value?: string | null) {
  return value?.trim() || null;
}
function booleanSetting(
  settings: Record<string, unknown>,
  key: string,
  fallback: boolean,
) {
  return typeof settings[key] === 'boolean' ? settings[key] : fallback;
}
function numberSetting(
  settings: Record<string, unknown>,
  key: string,
  fallback: number,
) {
  const value = Number(settings[key]);
  return Number.isFinite(value) ? value : fallback;
}
function stringSetting(
  settings: Record<string, unknown>,
  key: string,
  fallback: string,
) {
  return typeof settings[key] === 'string' ? settings[key] : fallback;
}
function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}
function startOfDay(value: Date) {
  const result = new Date(value);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}
function endOfDay(value: Date) {
  const result = new Date(value);
  result.setUTCHours(23, 59, 59, 999);
  return result;
}
function daysBetween(start: Date, end: Date) {
  return Math.floor(
    (startOfDay(end).getTime() - startOfDay(start).getTime()) / 86_400_000,
  );
}
