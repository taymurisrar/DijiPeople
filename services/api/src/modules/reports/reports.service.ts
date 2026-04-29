import { Injectable } from '@nestjs/common';
import {
  AttendanceEntryStatus,
  EmployeeEmploymentStatus,
  LeaveRequestStatus,
  RecruitmentStage,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getHeadcountSummary(tenantId: string) {
    const [totalEmployees, employmentStatusCounts, departmentCounts] =
      await Promise.all([
        this.prisma.employee.count({
          where: { tenantId },
        }),
        this.prisma.employee.groupBy({
          by: ['employmentStatus'],
          where: { tenantId },
          _count: { _all: true },
        }),
        this.prisma.employee.groupBy({
          by: ['departmentId'],
          where: { tenantId },
          _count: { _all: true },
          orderBy: {
            _count: {
              departmentId: 'desc',
            },
          },
          take: 6,
        }),
      ]);

    const departmentIds = departmentCounts
      .map((item) => item.departmentId)
      .filter((item): item is string => Boolean(item));

    const departments = departmentIds.length
      ? await this.prisma.department.findMany({
          where: {
            tenantId,
            id: { in: departmentIds },
          },
          select: {
            id: true,
            name: true,
            code: true,
          },
        })
      : [];

    const departmentMap = new Map(
      departments.map((department) => [department.id, department]),
    );
    const statusMap = new Map(
      employmentStatusCounts.map((item) => [
        item.employmentStatus,
        item._count._all,
      ]),
    );

    return {
      totalEmployees,
      statuses: {
        active: statusMap.get(EmployeeEmploymentStatus.ACTIVE) ?? 0,
        probation: statusMap.get(EmployeeEmploymentStatus.PROBATION) ?? 0,
        notice: statusMap.get(EmployeeEmploymentStatus.NOTICE) ?? 0,
        terminated: statusMap.get(EmployeeEmploymentStatus.TERMINATED) ?? 0,
      },
      departments: departmentCounts.map((item) => ({
        departmentId: item.departmentId,
        departmentName: item.departmentId
          ? (departmentMap.get(item.departmentId)?.name ?? 'Unknown department')
          : 'Unassigned',
        count: item._count._all,
      })),
    };
  }

  async getLeaveSummary(tenantId: string) {
    const [totalRequests, statusCounts, leaveTypeCounts] = await Promise.all([
      this.prisma.leaveRequest.count({
        where: { tenantId },
      }),
      this.prisma.leaveRequest.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { _all: true },
      }),
      this.prisma.leaveRequest.groupBy({
        by: ['leaveTypeId'],
        where: { tenantId },
        _count: { _all: true },
        orderBy: {
          _count: {
            leaveTypeId: 'desc',
          },
        },
        take: 5,
      }),
    ]);

    const leaveTypeIds = leaveTypeCounts.map((item) => item.leaveTypeId);
    const leaveTypes = leaveTypeIds.length
      ? await this.prisma.leaveType.findMany({
          where: {
            tenantId,
            id: { in: leaveTypeIds },
          },
          select: {
            id: true,
            name: true,
            code: true,
          },
        })
      : [];

    const leaveTypeMap = new Map(
      leaveTypes.map((leaveType) => [leaveType.id, leaveType]),
    );
    const statusMap = new Map(
      statusCounts.map((item) => [item.status, item._count._all]),
    );

    return {
      totalRequests,
      statuses: {
        pending: statusMap.get(LeaveRequestStatus.PENDING) ?? 0,
        approved: statusMap.get(LeaveRequestStatus.APPROVED) ?? 0,
        rejected: statusMap.get(LeaveRequestStatus.REJECTED) ?? 0,
        cancelled: statusMap.get(LeaveRequestStatus.CANCELLED) ?? 0,
      },
      leaveTypes: leaveTypeCounts.map((item) => ({
        leaveTypeId: item.leaveTypeId,
        leaveTypeName:
          leaveTypeMap.get(item.leaveTypeId)?.name ?? 'Unknown leave type',
        count: item._count._all,
      })),
    };
  }

  async getAttendanceSummary(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastSevenDays = new Date(today);
    lastSevenDays.setDate(lastSevenDays.getDate() - 6);

    const [todayEntries, todayStatusCounts, recentEntries] = await Promise.all([
      this.prisma.attendanceEntry.count({
        where: {
          tenantId,
          date: today,
        },
      }),
      this.prisma.attendanceEntry.groupBy({
        by: ['status'],
        where: {
          tenantId,
          date: today,
        },
        _count: { _all: true },
      }),
      this.prisma.attendanceEntry.findMany({
        where: {
          tenantId,
          date: {
            gte: lastSevenDays,
            lte: today,
          },
        },
        select: {
          date: true,
          status: true,
        },
      }),
    ]);

    const statusMap = new Map(
      todayStatusCounts.map((item) => [item.status, item._count._all]),
    );
    const dailyMap = new Map<
      string,
      {
        date: string;
        total: number;
        present: number;
        late: number;
      }
    >();

    for (const entry of recentEntries) {
      const key = entry.date.toISOString().slice(0, 10);
      const current = dailyMap.get(key) ?? {
        date: key,
        total: 0,
        present: 0,
        late: 0,
      };

      current.total += 1;

      if (entry.status === AttendanceEntryStatus.PRESENT) {
        current.present += 1;
      }

      if (entry.status === AttendanceEntryStatus.LATE) {
        current.late += 1;
      }

      dailyMap.set(key, current);
    }

    const daily: Array<{
      date: string;
      total: number;
      present: number;
      late: number;
    }> = [];
    const cursor = new Date(lastSevenDays);

    while (cursor <= today) {
      const key = cursor.toISOString().slice(0, 10);
      daily.push(
        dailyMap.get(key) ?? {
          date: key,
          total: 0,
          present: 0,
          late: 0,
        },
      );
      cursor.setDate(cursor.getDate() + 1);
    }

    return {
      today: {
        totalEntries: todayEntries,
        statuses: {
          present: statusMap.get(AttendanceEntryStatus.PRESENT) ?? 0,
          late: statusMap.get(AttendanceEntryStatus.LATE) ?? 0,
          absent: statusMap.get(AttendanceEntryStatus.ABSENT) ?? 0,
          halfDay: statusMap.get(AttendanceEntryStatus.HALF_DAY) ?? 0,
          missedCheckOut:
            statusMap.get(AttendanceEntryStatus.MISSED_CHECK_OUT) ?? 0,
        },
      },
      daily,
    };
  }

  async getRecruitmentSummary(tenantId: string) {
    const [jobStatusCounts, candidateStageCounts, applicationStageCounts] =
      await Promise.all([
        this.prisma.jobOpening.groupBy({
          by: ['status'],
          where: { tenantId },
          _count: { _all: true },
        }),
        this.prisma.candidate.groupBy({
          by: ['currentStatus'],
          where: { tenantId },
          _count: { _all: true },
        }),
        this.prisma.application.groupBy({
          by: ['stage'],
          where: { tenantId },
          _count: { _all: true },
        }),
      ]);

    const jobMap = new Map(
      jobStatusCounts.map((item) => [item.status, item._count._all]),
    );
    const candidateMap = new Map(
      candidateStageCounts.map((item) => [
        item.currentStatus,
        item._count._all,
      ]),
    );

    return {
      jobs: {
        open: jobMap.get('OPEN') ?? 0,
        onHold: jobMap.get('ON_HOLD') ?? 0,
        filled: jobMap.get('FILLED') ?? 0,
        closed: jobMap.get('CLOSED') ?? 0,
      },
      candidates: {
        applied: candidateMap.get(RecruitmentStage.APPLIED) ?? 0,
        screening: candidateMap.get(RecruitmentStage.SCREENING) ?? 0,
        interview: candidateMap.get(RecruitmentStage.INTERVIEW) ?? 0,
        offer: candidateMap.get(RecruitmentStage.OFFER) ?? 0,
        hired: candidateMap.get(RecruitmentStage.HIRED) ?? 0,
      },
      applicationsByStage: applicationStageCounts.map((item) => ({
        stage: item.stage,
        count: item._count._all,
      })),
    };
  }
}
