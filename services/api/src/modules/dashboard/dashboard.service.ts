import { Injectable } from '@nestjs/common';
import {
  ApprovalActorType,
  AttendanceEntryStatus,
  EmployeeEmploymentStatus,
  LeaveApprovalStepStatus,
  LeaveRequestStatus,
  OnboardingTaskStatus,
  PayrollExceptionSeverity,
  PayrollRunStatus,
  PayrollStatus,
  PayslipStatus,
  Prisma,
  TimesheetStatus,
  UserInvitationStatus,
  UserStatus,
} from '@prisma/client';
import { ROLE_KEYS } from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';

type DashboardWidgetType =
  | 'metric-card'
  | 'kpi-card'
  | 'chart'
  | 'table'
  | 'work-queue'
  | 'insight-list'
  | 'quick-actions'
  | 'profile-summary'
  | 'attendance-summary'
  | 'leave-summary'
  | 'payroll-summary'
  | 'timesheet-summary'
  | 'approval-aging'
  | 'compliance-status'
  | 'exception-list';

type DashboardSeverity = 'neutral' | 'good' | 'warning' | 'critical';

type DashboardAction = {
  key: string;
  label: string;
  href: string;
  description?: string;
  icon?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  badgeCount?: number;
};

type DashboardWidget = {
  key: string;
  title: string;
  description?: string;
  type: DashboardWidgetType;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  order: number;
  value?: number | string;
  subtitle?: string;
  severity?: DashboardSeverity;
  trend?: {
    direction: 'up' | 'down' | 'flat';
    value: number | string;
    label: string;
  };
  data?: unknown;
  emptyState?: string;
  action?: DashboardAction;
  actions?: DashboardAction[];
};

type DashboardSection = {
  key: string;
  title: string;
  description?: string;
  layout: 'grid' | 'list' | 'table' | 'split';
  order: number;
  widgets: DashboardWidget[];
};

type DashboardView = {
  key: 'admin' | 'hr' | 'manager' | 'employee';
  label: string;
  description: string;
  icon: string;
  visible: true;
  order: number;
  badgeCount?: number;
  sections: DashboardSection[];
};

const currentEmployeeSelect = {
  id: true,
  firstName: true,
  lastName: true,
  employeeCode: true,
  managerEmployeeId: true,
  departmentId: true,
  designationId: true,
  employeeLevelId: true,
  businessUnitId: true,
  email: true,
  employmentStatus: true,
  hireDate: true,
  ownerUserId: true,
  manager: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
  department: { select: { name: true } },
  designation: { select: { name: true } },
} satisfies Prisma.EmployeeSelect;

type CurrentEmployee = Prisma.EmployeeGetPayload<{
  select: typeof currentEmployeeSelect;
}>;

const PRIVILEGED_ROLES = new Set<string>([
  ROLE_KEYS.GLOBAL_ADMIN,
  ROLE_KEYS.SYSTEM_ADMIN,
  ROLE_KEYS.SYSTEM_CUSTOMIZER,
]);

const ROUTES = new Set<string>([
  '/dashboard/attendance',
  '/dashboard/attendance/team',
  '/dashboard/documents',
  '/dashboard/employees',
  '/dashboard/employees/import',
  '/dashboard/employees/new',
  '/dashboard/leave',
  '/dashboard/leave/approvals',
  '/dashboard/leave/new',
  '/dashboard/me/payslips',
  '/dashboard/onboarding',
  '/dashboard/payroll',
  '/dashboard/payroll/compensation',
  '/dashboard/payroll/runs',
  '/dashboard/profile',
  '/dashboard/settings',
  '/dashboard/settings/access',
  '/dashboard/settings/approval-matrices',
  '/dashboard/settings/attendance',
  '/dashboard/settings/branding',
  '/dashboard/settings/customization',
  '/dashboard/settings/documents',
  '/dashboard/settings/employees',
  '/dashboard/settings/leave-policies',
  '/dashboard/settings/payroll',
  '/dashboard/settings/tenant',
  '/dashboard/timesheets',
  '/dashboard/timesheets/approvals',
  '/dashboard/users',
  '/dashboard/claims',
]);

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(currentUser: AuthenticatedUser) {
    const currentEmployee = await this.prisma.employee.findFirst({
      where: this.employeeBaseWhere(currentUser, {
        userId: currentUser.userId,
      }),
      select: currentEmployeeSelect,
    });

    const directReportsCount = currentEmployee
      ? await this.prisma.employee.count({
          where: this.employeeScopedWhere(currentUser, {
            managerEmployeeId: currentEmployee.id,
          }),
        })
      : 0;

    const canSeeAllViews = this.hasPrivilegedRole(currentUser);
    const canSeeAdmin = this.canViewAdminDashboard(currentUser);
    const canSeeHr = this.canViewHrDashboard(currentUser);
    const canSeeManager = this.canViewManagerDashboard(
      currentUser,
      directReportsCount,
    );
    const canSeeEmployee =
      canSeeAllViews ||
      Boolean(currentEmployee) ||
      this.canViewEmployeeDashboard(currentUser);

    const views = (
      await Promise.all([
        canSeeAdmin ? this.buildAdminView(currentUser) : null,
        canSeeHr ? this.buildHrView(currentUser) : null,
        canSeeManager
          ? this.buildManagerView(currentUser, currentEmployee?.id ?? null)
          : null,
        canSeeEmployee
          ? this.buildEmployeeView(currentUser, currentEmployee)
          : null,
      ])
    ).filter((view): view is DashboardView => Boolean(view));

    return {
      defaultView: this.resolveDefaultView(currentUser, views),
      views: views.sort((a, b) => a.order - b.order),
    };
  }

  private async buildAdminView(
    currentUser: AuthenticatedUser,
  ): Promise<DashboardView> {
    const startOfMonth = this.getStartOfMonth();
    const today = this.getTodayRange();

    const [
      activeEmployees,
      draftEmployees,
      employeesAddedThisMonth,
      activeUsers,
      pendingInvites,
      attendance,
      leave,
      payroll,
      timesheets,
      setup,
      dataQuality,
      recentActivity,
    ] = await Promise.all([
      this.countEmployees(currentUser, {
        employmentStatus: EmployeeEmploymentStatus.ACTIVE,
      }),
      this.countEmployees(currentUser, { isDraftProfile: true }),
      this.countEmployees(currentUser, { createdAt: { gte: startOfMonth } }),
      this.prisma.user.count({
        where: { tenantId: currentUser.tenantId, status: UserStatus.ACTIVE },
      }),
      this.prisma.userInvitation.count({
        where: {
          tenantId: currentUser.tenantId,
          status: UserInvitationStatus.PENDING,
        },
      }),
      this.getAttendanceOperations(currentUser, today),
      this.getLeaveOperations(currentUser),
      this.getPayrollOperations(currentUser),
      this.getTimesheetOperations(currentUser),
      this.getTenantSetupHealth(currentUser),
      this.getDataQuality(currentUser),
      this.getRecentActivity(currentUser),
    ]);

    const pendingApprovals =
      leave.pendingRequests +
      timesheets.pendingApproval +
      payroll.pendingRuns +
      payroll.openExceptions;

    return {
      key: 'admin',
      label: 'Admin',
      description: 'Tenant-wide operational overview and setup health.',
      icon: 'shield',
      visible: true,
      order: 10,
      badgeCount: pendingApprovals + dataQuality.totalWarnings,
      sections: [
        this.section('overview', 'Operational overview', 'grid', 10, [
          this.metric(
            'activeEmployees',
            'Active employees',
            activeEmployees,
            'Currently active employee records.',
            '/dashboard/employees',
          ),
          this.metric(
            'draftEmployees',
            'Draft employees',
            draftEmployees,
            'Incomplete employee records.',
            '/dashboard/employees',
            draftEmployees ? 'warning' : 'good',
          ),
          this.metric(
            'employeesAdded',
            'Added this month',
            employeesAddedThisMonth,
            'New employee records created this month.',
            '/dashboard/employees',
          ),
          this.metric(
            'activeUsers',
            'Active users',
            activeUsers,
            'Users who can access this tenant.',
            '/dashboard/users',
          ),
          this.metric(
            'pendingInvites',
            'Pending invitations',
            pendingInvites,
            'Invites that still need activation.',
            '/dashboard/settings/access',
            pendingInvites ? 'warning' : 'good',
          ),
          this.metric(
            'pendingApprovals',
            'Pending process items',
            pendingApprovals,
            'Leave, payroll, and timesheet work waiting for action.',
            '/dashboard/leave/approvals',
            pendingApprovals ? 'warning' : 'good',
          ),
        ]),
        this.section('attendance', 'Attendance operations', 'grid', 20, [
          this.summaryWidget(
            'attendanceToday',
            'Today attendance',
            'attendance-summary',
            attendance,
            '/dashboard/attendance',
          ),
          this.exceptionWidget(
            'attendanceExceptions',
            'Attendance exceptions',
            attendance.exceptions,
            '/dashboard/attendance',
          ),
        ]),
        this.section('leave', 'Leave operations', 'grid', 30, [
          this.summaryWidget(
            'leaveSummary',
            'Leave status',
            'leave-summary',
            leave,
            '/dashboard/leave',
          ),
          this.tableWidget(
            'upcomingLeaves',
            'Upcoming approved leaves',
            leave.upcomingRows,
            '/dashboard/leave',
          ),
        ]),
        this.section('payroll', 'Payroll operations', 'grid', 40, [
          this.summaryWidget(
            'payrollSummary',
            'Payroll readiness',
            'payroll-summary',
            payroll,
            '/dashboard/payroll',
          ),
          this.exceptionWidget(
            'payrollExceptions',
            'Payroll exceptions',
            payroll.exceptionRows,
            '/dashboard/payroll/runs',
          ),
        ]),
        this.section('timesheets', 'Timesheet operations', 'grid', 50, [
          this.summaryWidget(
            'timesheetSummary',
            'Timesheet status',
            'timesheet-summary',
            timesheets,
            '/dashboard/timesheets',
          ),
          this.tableWidget(
            'timesheetQueue',
            'Timesheets awaiting approval',
            timesheets.approvalRows,
            '/dashboard/timesheets/approvals',
          ),
        ]),
        this.section('setup', 'Tenant setup health', 'grid', 60, [
          this.kpiWidget('tenantSetup', 'Setup status', setup),
        ]),
        this.section('quality', 'Data quality warnings', 'list', 70, [
          this.insightWidget('dataQuality', 'Data quality', dataQuality.items),
        ]),
        this.section('activity', 'Recent activity', 'list', 80, [
          this.tableWidget(
            'recentActivity',
            'Recent changes',
            recentActivity,
            '/dashboard/settings/audit',
          ),
        ]),
        this.section('actions', 'Quick actions', 'grid', 90, [
          this.quickActionsWidget(
            'adminActions',
            this.actions(currentUser, [
              this.action(
                'createEmployee',
                'Create employee',
                '/dashboard/employees/new',
                'employees.create',
              ),
              this.action(
                'importEmployees',
                'Import employees',
                '/dashboard/employees/import',
                'employees.import',
              ),
              this.action(
                'users',
                'Manage users',
                '/dashboard/users',
                'users.read',
              ),
              this.action(
                'roles',
                'Roles and permissions',
                '/dashboard/settings/access',
                'roles.read',
              ),
              this.action(
                'tenantSettings',
                'Tenant settings',
                '/dashboard/settings/tenant',
                'tenant.settings.manage',
              ),
              this.action(
                'branding',
                'Branding',
                '/dashboard/settings/branding',
                'branding.manage',
              ),
              this.action(
                'attendance',
                'Attendance',
                '/dashboard/attendance',
                'attendance.read',
              ),
              this.action(
                'leaveApprovals',
                'Leave approvals',
                '/dashboard/leave/approvals',
                'leave-requests.approve',
              ),
              this.action(
                'payrollRuns',
                'Payroll runs',
                '/dashboard/payroll/runs',
                'payroll-runs.read',
              ),
              this.action(
                'timesheetApprovals',
                'Timesheet approvals',
                '/dashboard/timesheets/approvals',
                'timesheets.approve',
              ),
              this.action(
                'customization',
                'Customization',
                '/dashboard/settings/customization',
                'customization.access',
              ),
            ]),
          ),
        ]),
      ],
    };
  }

  private async buildHrView(
    currentUser: AuthenticatedUser,
  ): Promise<DashboardView> {
    const startOfMonth = this.getStartOfMonth();
    const confirmationCutoff = new Date();
    confirmationCutoff.setDate(confirmationCutoff.getDate() + 30);
    const today = this.getTodayRange();

    const [
      activeEmployees,
      newHires,
      upcomingJoining,
      probationEmployees,
      confirmationDue,
      attendance,
      leave,
      payroll,
      timesheets,
      missingDocuments,
      noManager,
      lifecycleRows,
    ] = await Promise.all([
      this.countEmployees(currentUser, {
        employmentStatus: EmployeeEmploymentStatus.ACTIVE,
      }),
      this.countEmployees(currentUser, { hireDate: { gte: startOfMonth } }),
      this.countEmployees(currentUser, { hireDate: { gte: new Date() } }),
      this.countEmployees(currentUser, {
        employmentStatus: EmployeeEmploymentStatus.PROBATION,
      }),
      this.countEmployees(currentUser, {
        employmentStatus: EmployeeEmploymentStatus.PROBATION,
        confirmationDate: { lte: confirmationCutoff },
      }),
      this.getAttendanceOperations(currentUser, today),
      this.getLeaveOperations(currentUser, true),
      this.getPayrollOperations(currentUser),
      this.getTimesheetOperations(currentUser),
      this.countEmployees(currentUser, { documentLinks: { none: {} } }),
      this.countEmployees(currentUser, { managerEmployeeId: null }),
      this.getEmployeeLifecycleRows(currentUser, confirmationCutoff),
    ]);

    const pendingHrWork =
      leave.hrPendingSteps +
      attendance.exceptions.length +
      missingDocuments +
      payroll.missingSetup +
      timesheets.missingTimesheets;

    return {
      key: 'hr',
      label: 'HR',
      description: 'Employee lifecycle, compliance, and HR work queues.',
      icon: 'users',
      visible: true,
      order: 20,
      badgeCount: pendingHrWork,
      sections: [
        this.section('overview', 'HR operations overview', 'grid', 10, [
          this.metric(
            'activeEmployees',
            'Active employees',
            activeEmployees,
            'Active workforce.',
            '/dashboard/employees',
          ),
          this.metric(
            'newHires',
            'New hires this month',
            newHires,
            'Employees hired this month.',
            '/dashboard/employees',
          ),
          this.metric(
            'upcomingJoining',
            'Upcoming joining',
            upcomingJoining,
            'Employees with future hire dates.',
            '/dashboard/employees',
            upcomingJoining ? 'warning' : 'good',
          ),
          this.metric(
            'confirmationDue',
            'Confirmations due',
            confirmationDue,
            'Probation confirmations due within 30 days.',
            '/dashboard/employees',
            confirmationDue ? 'warning' : 'good',
          ),
          this.metric(
            'probationEmployees',
            'In probation',
            probationEmployees,
            'Employees currently in probation.',
            '/dashboard/employees',
          ),
          this.metric(
            'pendingHrWork',
            'HR work items',
            pendingHrWork,
            'Items requiring HR attention.',
            '/dashboard/leave/approvals',
            pendingHrWork ? 'warning' : 'good',
          ),
        ]),
        this.section('lifecycle', 'Employee lifecycle', 'table', 20, [
          this.tableWidget(
            'lifecycleRows',
            'Upcoming and probation employees',
            lifecycleRows,
            '/dashboard/employees',
          ),
        ]),
        this.section('attendance', 'Attendance and availability', 'grid', 30, [
          this.summaryWidget(
            'attendance',
            'Today attendance',
            'attendance-summary',
            attendance,
            '/dashboard/attendance',
          ),
          this.tableWidget(
            'upcomingLeaves',
            'Upcoming leave',
            leave.upcomingRows,
            '/dashboard/leave',
          ),
        ]),
        this.section('leave', 'Leave management', 'grid', 40, [
          this.summaryWidget(
            'leave',
            'Leave requests',
            'leave-summary',
            leave,
            '/dashboard/leave/approvals',
          ),
        ]),
        this.section('payroll', 'Payroll readiness', 'grid', 50, [
          this.summaryWidget(
            'payroll',
            'Payroll-impacting gaps',
            'payroll-summary',
            payroll,
            '/dashboard/payroll',
          ),
        ]),
        this.section('timesheets', 'Timesheet review', 'grid', 60, [
          this.summaryWidget(
            'timesheets',
            'Timesheet review',
            'timesheet-summary',
            timesheets,
            '/dashboard/timesheets/approvals',
          ),
        ]),
        this.section('documents', 'Document compliance', 'list', 70, [
          this.insightWidget('documents', 'Document gaps', [
            this.row(
              'missingDocuments',
              'Employees with no documents',
              missingDocuments,
              '/dashboard/documents',
              missingDocuments ? 'warning' : 'good',
            ),
            this.row(
              'noManager',
              'Employees without reporting manager',
              noManager,
              '/dashboard/employees',
              noManager ? 'warning' : 'good',
            ),
          ]),
        ]),
        this.section('actions', 'Quick actions', 'grid', 80, [
          this.quickActionsWidget(
            'hrActions',
            this.actions(currentUser, [
              this.action(
                'createEmployee',
                'Create employee',
                '/dashboard/employees/new',
                'employees.create',
              ),
              this.action(
                'importEmployees',
                'Import employees',
                '/dashboard/employees/import',
                'employees.import',
              ),
              this.action(
                'reviewLeave',
                'Review leave approvals',
                '/dashboard/leave/approvals',
                'leave-requests.approve',
              ),
              this.action(
                'documents',
                'Review documents',
                '/dashboard/documents',
                'documents.read',
              ),
              this.action(
                'attendance',
                'Review attendance',
                '/dashboard/attendance',
                'attendance.read',
              ),
              this.action(
                'leavePolicies',
                'Leave policies',
                '/dashboard/settings/leave-policies',
                'leave-policies.read',
              ),
              this.action(
                'payrollSetup',
                'Payroll setup',
                '/dashboard/payroll/compensation',
                'compensation.read',
              ),
            ]),
          ),
        ]),
      ],
    };
  }

  private async buildManagerView(
    currentUser: AuthenticatedUser,
    managerEmployeeId: string | null,
  ): Promise<DashboardView> {
    const teamWhere = managerEmployeeId
      ? this.employeeScopedWhere(currentUser, { managerEmployeeId })
      : this.employeeScopedWhere(currentUser, { id: '__none__' });
    const today = this.getTodayRange();
    const [
      directReports,
      teamAttendance,
      teamLeaves,
      timesheets,
      pendingLeaveApprovalSteps,
      directReportRows,
      teamDataQuality,
    ] = await Promise.all([
      this.prisma.employee.count({ where: teamWhere }),
      this.getAttendanceOperations(currentUser, today, teamWhere),
      this.getLeaveOperations(currentUser, false, teamWhere),
      this.getTimesheetOperations(currentUser, teamWhere),
      this.prisma.leaveApprovalStep.count({
        where: {
          tenantId: currentUser.tenantId,
          status: LeaveApprovalStepStatus.PENDING,
          approverUserId: currentUser.userId,
        },
      }),
      this.getDirectReportRows(teamWhere),
      this.getDataQuality(currentUser, teamWhere),
    ]);

    const pendingWork =
      pendingLeaveApprovalSteps +
      timesheets.pendingApproval +
      teamAttendance.exceptions.length;

    return {
      key: 'manager',
      label: 'Manager',
      description: 'Team approvals, attendance, leave, and timesheet status.',
      icon: 'briefcase',
      visible: true,
      order: 30,
      badgeCount: pendingWork,
      sections: [
        this.section('overview', 'Team overview', 'grid', 10, [
          this.metric(
            'directReports',
            'Direct reports',
            directReports,
            'Employees reporting to you.',
            '/dashboard/employees',
          ),
          this.metric(
            'pendingApprovals',
            'Pending approvals',
            pendingWork,
            'Team work waiting for action.',
            '/dashboard/leave/approvals',
            pendingWork ? 'warning' : 'good',
          ),
          this.metric(
            'teamCheckedIn',
            'Checked in today',
            teamAttendance.checkedIn,
            'Team members with attendance today.',
            '/dashboard/attendance/team',
          ),
          this.metric(
            'teamAbsent',
            'Absent today',
            teamAttendance.absent,
            'Direct reports without attendance.',
            '/dashboard/attendance/team',
            teamAttendance.absent ? 'warning' : 'good',
          ),
          this.metric(
            'teamOnLeave',
            'On leave today',
            teamLeaves.currentlyOnLeave,
            'Team members on approved leave.',
            '/dashboard/leave',
          ),
          this.metric(
            'timesheetsPending',
            'Timesheets pending',
            timesheets.pendingApproval,
            'Timesheets awaiting your action.',
            '/dashboard/timesheets/approvals',
            timesheets.pendingApproval ? 'warning' : 'good',
          ),
        ]),
        this.section('attendance', 'Team attendance', 'grid', 20, [
          this.summaryWidget(
            'attendance',
            'Team attendance snapshot',
            'attendance-summary',
            teamAttendance,
            '/dashboard/attendance/team',
          ),
        ]),
        this.section('leave', 'Team leaves', 'grid', 30, [
          this.summaryWidget(
            'leave',
            'Team leave requests',
            'leave-summary',
            teamLeaves,
            '/dashboard/leave/approvals',
          ),
          this.tableWidget(
            'upcomingTeamLeaves',
            'Upcoming team leaves',
            teamLeaves.upcomingRows,
            '/dashboard/leave',
          ),
        ]),
        this.section('timesheets', 'Team timesheets', 'grid', 40, [
          this.summaryWidget(
            'timesheets',
            'Team timesheet completion',
            'timesheet-summary',
            timesheets,
            '/dashboard/timesheets/approvals',
          ),
          this.tableWidget(
            'timesheetQueue',
            'Timesheet approval queue',
            timesheets.approvalRows,
            '/dashboard/timesheets/approvals',
          ),
        ]),
        this.section('reports', 'Direct reports', 'table', 50, [
          this.tableWidget(
            'directReports',
            'Direct reports',
            directReportRows,
            '/dashboard/employees',
          ),
        ]),
        this.section('quality', 'Team data quality', 'list', 60, [
          this.insightWidget(
            'teamQuality',
            'Team data quality',
            teamDataQuality.items,
          ),
        ]),
        this.section('actions', 'Quick actions', 'grid', 70, [
          this.quickActionsWidget(
            'managerActions',
            this.actions(currentUser, [
              this.action(
                'leaveApprovals',
                'Review leave approvals',
                '/dashboard/leave/approvals',
                'leave-requests.approve',
              ),
              this.action(
                'timesheets',
                'Review timesheets',
                '/dashboard/timesheets/approvals',
                'timesheets.approve',
              ),
              this.action(
                'teamEmployees',
                'Open team employees',
                '/dashboard/employees',
                'employees.read',
              ),
              this.action(
                'teamAttendance',
                'Open team attendance',
                '/dashboard/attendance/team',
                'attendance.read',
              ),
              this.action(
                'leave',
                'Open leave requests',
                '/dashboard/leave',
                'leave-requests.read',
              ),
            ]),
          ),
        ]),
      ],
    };
  }

  private async buildEmployeeView(
    currentUser: AuthenticatedUser,
    employee: CurrentEmployee | null,
  ): Promise<DashboardView> {
    const today = this.getTodayRange();
    const [attendance, leave, timesheets, documents, tasks, latestPayslip] =
      employee
        ? await Promise.all([
            this.getMyAttendance(currentUser, employee.id, today),
            this.getMyLeave(currentUser, employee.id),
            this.getMyTimesheets(currentUser, employee.id),
            this.prisma.documentLink.count({
              where: {
                tenantId: currentUser.tenantId,
                employeeId: employee.id,
              },
            }),
            this.prisma.onboardingTask.count({
              where: {
                tenantId: currentUser.tenantId,
                assignedUserId: currentUser.userId,
                status: {
                  in: [
                    OnboardingTaskStatus.PENDING,
                    OnboardingTaskStatus.IN_PROGRESS,
                  ],
                },
              },
            }),
            this.prisma.payslip.findFirst({
              where: {
                tenantId: currentUser.tenantId,
                employeeId: employee.id,
                status: PayslipStatus.PUBLISHED,
              },
              orderBy: { publishedAt: 'desc' },
              select: { id: true, payslipNumber: true, publishedAt: true },
            }),
          ])
        : [
            { todayStatus: 'No linked employee', recentRows: [] },
            { balanceRows: [], pendingRequests: 0, upcomingRows: [] },
            { currentStatus: 'No linked employee', recentRows: [] },
            0,
            0,
            null,
          ];

    const profileGaps = employee
      ? this.getProfileGaps(employee)
      : ['employee link'];
    const pendingRequests = employee ? leave.pendingRequests + tasks : tasks;

    return {
      key: 'employee',
      label: 'Employee',
      description: 'Self-service snapshot, requests, documents, and tasks.',
      icon: 'user',
      visible: true,
      order: 40,
      badgeCount: profileGaps.length + pendingRequests,
      sections: [
        this.section('snapshot', 'My snapshot', 'grid', 10, [
          this.metric(
            'profile',
            'Profile gaps',
            profileGaps.length,
            'Missing profile fields to complete.',
            '/dashboard/profile',
            profileGaps.length ? 'warning' : 'good',
          ),
          this.metric(
            'pendingRequests',
            'Pending requests',
            pendingRequests,
            'Leave requests and tasks waiting.',
            '/dashboard/leave',
            pendingRequests ? 'warning' : 'good',
          ),
          this.metric(
            'documents',
            'Documents uploaded',
            documents,
            'Documents linked to your employee record.',
            '/dashboard/documents',
          ),
          this.profileWidget(employee, profileGaps),
        ]),
        this.section('attendance', 'My attendance', 'grid', 20, [
          this.summaryWidget(
            'attendance',
            'Today attendance',
            'attendance-summary',
            attendance,
            '/dashboard/attendance',
          ),
          this.tableWidget(
            'recentAttendance',
            'Recent attendance',
            attendance.recentRows,
            '/dashboard/attendance',
          ),
        ]),
        this.section('leave', 'My leaves', 'grid', 30, [
          this.summaryWidget(
            'leave',
            'Leave balance and requests',
            'leave-summary',
            leave,
            '/dashboard/leave',
          ),
          this.tableWidget(
            'upcomingLeave',
            'Upcoming leave',
            leave.upcomingRows,
            '/dashboard/leave',
          ),
        ]),
        this.section('timesheets', 'My timesheets', 'grid', 40, [
          this.summaryWidget(
            'timesheets',
            'Timesheet status',
            'timesheet-summary',
            timesheets,
            '/dashboard/timesheets',
          ),
          this.tableWidget(
            'recentTimesheets',
            'Recent timesheets',
            timesheets.recentRows,
            '/dashboard/timesheets',
          ),
        ]),
        this.section('payroll', 'My payroll', 'grid', 50, [
          this.summaryWidget(
            'payslip',
            'Latest payslip',
            'payroll-summary',
            {
              latestPayslip: latestPayslip
                ? `${latestPayslip.payslipNumber} published ${latestPayslip.publishedAt?.toISOString().slice(0, 10) ?? ''}`.trim()
                : 'No published payslip',
            },
            '/dashboard/me/payslips',
          ),
        ]),
        this.section('tasks', 'My tasks', 'list', 60, [
          this.insightWidget('tasks', 'Action items', [
            ...profileGaps.map((gap) =>
              this.row(
                `gap-${gap}`,
                `Complete ${gap}`,
                1,
                '/dashboard/profile',
                'warning',
              ),
            ),
            this.row(
              'tasks',
              'Assigned onboarding tasks',
              tasks,
              '/dashboard/onboarding',
              tasks ? 'warning' : 'good',
            ),
          ]),
        ]),
        this.section('actions', 'Quick actions', 'grid', 70, [
          this.quickActionsWidget(
            'employeeActions',
            this.actions(currentUser, [
              this.action('profile', 'View profile', '/dashboard/profile'),
              this.action(
                'attendance',
                'View attendance',
                '/dashboard/attendance',
                'attendance.read',
              ),
              this.action(
                'requestLeave',
                'Request leave',
                '/dashboard/leave/new',
                'leave-requests.create',
              ),
              this.action(
                'timesheets',
                'Submit timesheet',
                '/dashboard/timesheets',
                'timesheets.write',
              ),
              this.action(
                'documents',
                'Upload documents',
                '/dashboard/documents',
                'documents.upload',
              ),
              this.action(
                'payslips',
                'View payslips',
                '/dashboard/me/payslips',
                'payslips.read-own',
              ),
            ]),
          ),
        ]),
      ],
    };
  }

  private async getAttendanceOperations(
    currentUser: AuthenticatedUser,
    today: { start: Date; end: Date },
    employeeWhere?: Prisma.EmployeeWhereInput,
  ) {
    const baseWhere: Prisma.AttendanceEntryWhereInput = {
      tenantId: currentUser.tenantId,
      date: { gte: today.start, lt: today.end },
      ...(employeeWhere ? { employee: employeeWhere } : {}),
    };
    const activeEmployeeCount = await this.prisma.employee.count({
      where: employeeWhere ?? this.employeeScopedWhere(currentUser),
    });
    const [entries, checkedIn, late, missingCheckout, onLeave] =
      await Promise.all([
        this.prisma.attendanceEntry.findMany({
          where: baseWhere,
          distinct: ['employeeId'],
          select: { employeeId: true },
        }),
        this.prisma.attendanceEntry.count({
          where: { ...baseWhere, checkIn: { not: null } },
        }),
        this.prisma.attendanceEntry.count({
          where: {
            ...baseWhere,
            OR: [
              { status: AttendanceEntryStatus.LATE },
              { isLateCheckIn: true },
            ],
          },
        }),
        this.prisma.attendanceEntry.count({
          where: {
            ...baseWhere,
            OR: [
              { status: AttendanceEntryStatus.MISSED_CHECK_OUT },
              { checkIn: { not: null }, checkOut: null },
            ],
          },
        }),
        this.prisma.attendanceEntry.count({
          where: { ...baseWhere, status: AttendanceEntryStatus.ON_LEAVE },
        }),
      ]);
    const exceptions = [
      this.row(
        'absent',
        'Absent employees',
        Math.max(activeEmployeeCount - entries.length, 0),
        '/dashboard/attendance',
        activeEmployeeCount - entries.length > 0 ? 'warning' : 'good',
      ),
      this.row(
        'late',
        'Late arrivals',
        late,
        '/dashboard/attendance',
        late ? 'warning' : 'good',
      ),
      this.row(
        'missingCheckout',
        'Missing check-outs',
        missingCheckout,
        '/dashboard/attendance',
        missingCheckout ? 'warning' : 'good',
      ),
    ];

    return {
      checkedIn,
      absent: Math.max(activeEmployeeCount - entries.length, 0),
      late,
      missingCheckout,
      onLeave,
      exceptions,
    };
  }

  private async getLeaveOperations(
    currentUser: AuthenticatedUser,
    includeHrQueue = false,
    employeeWhere?: Prisma.EmployeeWhereInput,
  ) {
    const today = this.getTodayRange();
    const requestWhere: Prisma.LeaveRequestWhereInput = {
      tenantId: currentUser.tenantId,
      ...(employeeWhere ? { employee: employeeWhere } : {}),
    };
    const [
      pendingRequests,
      currentlyOnLeave,
      upcoming,
      byStatus,
      hrPendingSteps,
    ] = await Promise.all([
      this.prisma.leaveRequest.count({
        where: { ...requestWhere, status: LeaveRequestStatus.PENDING },
      }),
      this.prisma.leaveRequest.count({
        where: {
          ...requestWhere,
          status: LeaveRequestStatus.APPROVED,
          startDate: { lte: today.end },
          endDate: { gte: today.start },
        },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          ...requestWhere,
          status: LeaveRequestStatus.APPROVED,
          startDate: { gte: today.start },
        },
        orderBy: { startDate: 'asc' },
        take: 5,
        select: {
          id: true,
          startDate: true,
          endDate: true,
          employee: {
            select: {
              employeeCode: true,
              firstName: true,
              lastName: true,
            },
          },
          leaveType: { select: { name: true } },
        },
      }),
      this.prisma.leaveRequest.groupBy({
        by: ['status'],
        where: requestWhere,
        _count: { _all: true },
      }),
      includeHrQueue
        ? this.prisma.leaveApprovalStep.count({
            where: {
              tenantId: currentUser.tenantId,
              status: LeaveApprovalStepStatus.PENDING,
              approverType: ApprovalActorType.HR,
            },
          })
        : 0,
    ]);

    return {
      pendingRequests,
      currentlyOnLeave,
      upcomingApproved: upcoming.length,
      hrPendingSteps,
      byStatus: byStatus.map((item) => ({
        label: item.status,
        value: item._count._all,
      })),
      upcomingRows: upcoming.map((request) => ({
        id: request.id,
        employee: this.employeeName(request.employee),
        leaveType: request.leaveType.name,
        date: `${request.startDate.toISOString().slice(0, 10)} to ${request.endDate.toISOString().slice(0, 10)}`,
        href: '/dashboard/leave',
      })),
    };
  }

  private async getPayrollOperations(currentUser: AuthenticatedUser) {
    const employeeScope = this.employeeScopedWhere(currentUser);
    const [
      period,
      pendingRuns,
      openExceptions,
      criticalExceptions,
      missingSetup,
    ] = await Promise.all([
      this.prisma.payrollPeriod.findFirst({
        where: {
          tenantId: currentUser.tenantId,
          periodStart: { lte: new Date() },
          periodEnd: { gte: new Date() },
        },
        orderBy: { periodStart: 'desc' },
        select: { id: true, name: true, status: true },
      }),
      this.prisma.payrollRun.count({
        where: {
          tenantId: currentUser.tenantId,
          status: {
            in: [
              PayrollRunStatus.DRAFT,
              PayrollRunStatus.CALCULATING,
              PayrollRunStatus.CALCULATED,
              PayrollRunStatus.REVIEWED,
              PayrollRunStatus.FAILED,
            ],
          },
        },
      }),
      this.prisma.payrollException.count({
        where: { tenantId: currentUser.tenantId, isResolved: false },
      }),
      this.prisma.payrollException.findMany({
        where: {
          tenantId: currentUser.tenantId,
          isResolved: false,
          severity: {
            in: [
              PayrollExceptionSeverity.ERROR,
              PayrollExceptionSeverity.WARNING,
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, errorType: true, message: true, severity: true },
      }),
      this.prisma.employee.count({
        where: {
          ...employeeScope,
          employmentStatus: EmployeeEmploymentStatus.ACTIVE,
          compensations: { none: { payrollStatus: PayrollStatus.ACTIVE } },
        },
      }),
    ]);

    return {
      currentPeriod: period?.name ?? 'No active period',
      currentPeriodStatus: period?.status ?? 'Not configured',
      pendingRuns,
      openExceptions,
      missingSetup,
      exceptionRows: criticalExceptions.map((exception) => ({
        id: exception.id,
        type: exception.errorType,
        message: exception.message,
        severity: exception.severity,
        href: '/dashboard/payroll/runs',
      })),
    };
  }

  private async getTimesheetOperations(
    currentUser: AuthenticatedUser,
    employeeWhere?: Prisma.EmployeeWhereInput,
  ) {
    const where: Prisma.TimesheetWhereInput = {
      tenantId: currentUser.tenantId,
      ...(employeeWhere ? { employee: employeeWhere } : {}),
    };
    const [pendingSubmission, pendingApproval, submitted, approvalRows] =
      await Promise.all([
        this.prisma.timesheet.count({
          where: { ...where, status: TimesheetStatus.DRAFT },
        }),
        this.prisma.timesheet.count({
          where: { ...where, status: TimesheetStatus.SUBMITTED },
        }),
        this.prisma.timesheet.count({
          where: { ...where, status: TimesheetStatus.SUBMITTED },
        }),
        this.prisma.timesheet.findMany({
          where: { ...where, status: TimesheetStatus.SUBMITTED },
          orderBy: { submittedAt: 'asc' },
          take: 5,
          select: {
            id: true,
            periodStart: true,
            periodEnd: true,
            employee: {
              select: {
                employeeCode: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        }),
      ]);

    return {
      pendingSubmission,
      pendingApproval,
      submitted,
      missingTimesheets: pendingSubmission,
      approvalRows: approvalRows.map((timesheet) => ({
        id: timesheet.id,
        employee: this.employeeName(timesheet.employee),
        period: `${timesheet.periodStart.toISOString().slice(0, 10)} to ${timesheet.periodEnd.toISOString().slice(0, 10)}`,
        href: '/dashboard/timesheets/approvals',
      })),
    };
  }

  private async getMyAttendance(
    currentUser: AuthenticatedUser,
    employeeId: string,
    today: { start: Date; end: Date },
  ) {
    const [todayEntry, recent] = await Promise.all([
      this.prisma.attendanceEntry.findFirst({
        where: {
          tenantId: currentUser.tenantId,
          employeeId,
          date: { gte: today.start, lt: today.end },
        },
        select: { status: true, checkIn: true, checkOut: true },
      }),
      this.prisma.attendanceEntry.findMany({
        where: { tenantId: currentUser.tenantId, employeeId },
        orderBy: { date: 'desc' },
        take: 5,
        select: {
          id: true,
          date: true,
          status: true,
          checkIn: true,
          checkOut: true,
        },
      }),
    ]);

    return {
      todayStatus: todayEntry?.status ?? 'Not checked in',
      checkIn: todayEntry?.checkIn?.toISOString() ?? null,
      checkOut: todayEntry?.checkOut?.toISOString() ?? null,
      recentRows: recent.map((entry) => ({
        id: entry.id,
        date: entry.date.toISOString().slice(0, 10),
        status: entry.status,
        checkIn: entry.checkIn?.toISOString().slice(11, 16) ?? '-',
        checkOut: entry.checkOut?.toISOString().slice(11, 16) ?? '-',
      })),
    };
  }

  private async getMyLeave(currentUser: AuthenticatedUser, employeeId: string) {
    const today = this.getTodayRange();
    const [balances, pendingRequests, upcoming] = await Promise.all([
      this.prisma.leaveBalance.findMany({
        where: { tenantId: currentUser.tenantId, employeeId },
        select: {
          totalRemaining: true,
          leaveType: { select: { name: true } },
        },
      }),
      this.prisma.leaveRequest.count({
        where: {
          tenantId: currentUser.tenantId,
          employeeId,
          status: LeaveRequestStatus.PENDING,
        },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          tenantId: currentUser.tenantId,
          employeeId,
          startDate: { gte: today.start },
          status: LeaveRequestStatus.APPROVED,
        },
        orderBy: { startDate: 'asc' },
        take: 5,
        select: {
          id: true,
          startDate: true,
          endDate: true,
          leaveType: { select: { name: true } },
        },
      }),
    ]);

    return {
      balanceRows: balances.map((balance) => ({
        label: balance.leaveType.name,
        value: Number(balance.totalRemaining),
      })),
      pendingRequests,
      upcomingRows: upcoming.map((request) => ({
        id: request.id,
        leaveType: request.leaveType.name,
        date: `${request.startDate.toISOString().slice(0, 10)} to ${request.endDate.toISOString().slice(0, 10)}`,
        href: '/dashboard/leave',
      })),
    };
  }

  private async getMyTimesheets(
    currentUser: AuthenticatedUser,
    employeeId: string,
  ) {
    const recent = await this.prisma.timesheet.findMany({
      where: { tenantId: currentUser.tenantId, employeeId },
      orderBy: { periodStart: 'desc' },
      take: 5,
      select: {
        id: true,
        status: true,
        periodStart: true,
        periodEnd: true,
      },
    });

    return {
      currentStatus: recent[0]?.status ?? 'No timesheet',
      recentRows: recent.map((timesheet) => ({
        id: timesheet.id,
        period: `${timesheet.periodStart.toISOString().slice(0, 10)} to ${timesheet.periodEnd.toISOString().slice(0, 10)}`,
        status: timesheet.status,
        href: '/dashboard/timesheets',
      })),
    };
  }

  private async getTenantSetupHealth(currentUser: AuthenticatedUser) {
    const [
      tenant,
      brandingCount,
      activeRoles,
      permissionCount,
      approvalMatrices,
      leavePolicies,
      attendancePolicy,
      payrollCalendars,
      documentTypes,
    ] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: currentUser.tenantId },
        select: { name: true, slug: true },
      }),
      this.prisma.tenantSetting.count({
        where: { tenantId: currentUser.tenantId, category: 'branding' },
      }),
      this.prisma.role.count({
        where: { tenantId: currentUser.tenantId, isActive: true },
      }),
      this.prisma.permission.count({
        where: { tenantId: currentUser.tenantId },
      }),
      this.prisma.approvalMatrix.count({
        where: { tenantId: currentUser.tenantId, isActive: true },
      }),
      this.prisma.leavePolicy.count({
        where: { tenantId: currentUser.tenantId, isActive: true },
      }),
      this.prisma.attendancePolicy.count({
        where: { tenantId: currentUser.tenantId },
      }),
      this.prisma.payrollCalendar.count({
        where: { tenantId: currentUser.tenantId, isActive: true },
      }),
      this.prisma.documentType.count({
        where: { tenantId: currentUser.tenantId, isActive: true },
      }),
    ]);

    const items = [
      this.setupItem(
        'tenantProfile',
        'Tenant profile configured',
        Boolean(tenant?.name && tenant.slug),
        '/dashboard/settings/tenant',
      ),
      this.setupItem(
        'branding',
        'Branding configured',
        brandingCount > 0,
        '/dashboard/settings/branding',
      ),
      this.setupItem(
        'roles',
        'Roles configured',
        activeRoles > 0,
        '/dashboard/settings/access',
      ),
      this.setupItem(
        'permissions',
        'Permissions configured',
        permissionCount > 0,
        '/dashboard/settings/access',
      ),
      this.setupItem(
        'approvalMatrices',
        'Approval matrices configured',
        approvalMatrices > 0,
        '/dashboard/settings/approval-matrices',
      ),
      this.setupItem(
        'leavePolicies',
        'Leave policies configured',
        leavePolicies > 0,
        '/dashboard/settings/leave-policies',
      ),
      this.setupItem(
        'attendancePolicy',
        'Attendance settings configured',
        attendancePolicy > 0,
        '/dashboard/settings/attendance',
      ),
      this.setupItem(
        'payrollCalendars',
        'Payroll calendars configured',
        payrollCalendars > 0,
        '/dashboard/settings/payroll',
      ),
      this.setupItem(
        'documentTypes',
        'Document types configured',
        documentTypes > 0,
        '/dashboard/settings/documents',
      ),
    ];

    return {
      complete: items.filter((item) => item.status === 'good').length,
      total: items.length,
      items,
    };
  }

  private async getDataQuality(
    currentUser: AuthenticatedUser,
    where?: Prisma.EmployeeWhereInput,
  ) {
    const scopedWhere = where ?? this.employeeScopedWhere(currentUser);
    const [
      noManager,
      noOwner,
      noEmail,
      noDepartment,
      noDesignation,
      noLevel,
      noPayrollSetup,
      usersWithoutEmployee,
    ] = await Promise.all([
      this.prisma.employee.count({
        where: { ...scopedWhere, managerEmployeeId: null },
      }),
      this.prisma.employee.count({
        where: { ...scopedWhere, ownerUserId: null },
      }),
      this.prisma.employee.count({
        where: { ...scopedWhere, OR: [{ email: null }, { email: '' }] },
      }),
      this.prisma.employee.count({
        where: { ...scopedWhere, departmentId: null },
      }),
      this.prisma.employee.count({
        where: { ...scopedWhere, designationId: null },
      }),
      this.prisma.employee.count({
        where: { ...scopedWhere, employeeLevelId: null },
      }),
      this.prisma.employee.count({
        where: {
          ...scopedWhere,
          compensations: { none: { payrollStatus: PayrollStatus.ACTIVE } },
        },
      }),
      this.prisma.user.count({
        where: {
          tenantId: currentUser.tenantId,
          employee: null,
          isServiceAccount: false,
        },
      }),
    ]);

    const items = [
      this.row(
        'noManager',
        'Employees without reporting manager',
        noManager,
        '/dashboard/employees',
        noManager ? 'warning' : 'good',
      ),
      this.row(
        'noOwner',
        'Employees without owner',
        noOwner,
        '/dashboard/employees',
        noOwner ? 'warning' : 'good',
      ),
      this.row(
        'noEmail',
        'Employees missing work email',
        noEmail,
        '/dashboard/employees',
        noEmail ? 'warning' : 'good',
      ),
      this.row(
        'noDepartment',
        'Employees missing department',
        noDepartment,
        '/dashboard/employees',
        noDepartment ? 'warning' : 'good',
      ),
      this.row(
        'noDesignation',
        'Employees missing designation',
        noDesignation,
        '/dashboard/employees',
        noDesignation ? 'warning' : 'good',
      ),
      this.row(
        'noLevel',
        'Employees missing employee level',
        noLevel,
        '/dashboard/employees',
        noLevel ? 'warning' : 'good',
      ),
      this.row(
        'noPayrollSetup',
        'Employees missing payroll setup',
        noPayrollSetup,
        '/dashboard/payroll/compensation',
        noPayrollSetup ? 'warning' : 'good',
      ),
      this.row(
        'usersWithoutEmployee',
        'Users not linked to employee records',
        usersWithoutEmployee,
        '/dashboard/users',
        usersWithoutEmployee ? 'warning' : 'good',
      ),
    ];

    return {
      totalWarnings: items.reduce((sum, item) => sum + Number(item.value), 0),
      items,
    };
  }

  private async getRecentActivity(currentUser: AuthenticatedUser) {
    const [employeeChanges, leaveRequests, timesheets, payrollRuns] =
      await Promise.all([
        this.prisma.auditLog.findMany({
          where: { tenantId: currentUser.tenantId, entityType: 'Employee' },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, action: true, entityId: true, createdAt: true },
        }),
        this.prisma.leaveRequest.findMany({
          where: { tenantId: currentUser.tenantId },
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: { id: true, status: true, createdAt: true },
        }),
        this.prisma.timesheet.findMany({
          where: { tenantId: currentUser.tenantId },
          orderBy: { updatedAt: 'desc' },
          take: 3,
          select: { id: true, status: true, updatedAt: true },
        }),
        this.prisma.payrollRun.findMany({
          where: { tenantId: currentUser.tenantId },
          orderBy: { updatedAt: 'desc' },
          take: 3,
          select: { id: true, status: true, updatedAt: true },
        }),
      ]);

    return [
      ...employeeChanges.map((item) => ({
        id: item.id,
        type: 'Employee',
        label: item.action,
        date: item.createdAt.toISOString(),
        href: `/dashboard/employees/${item.entityId}`,
      })),
      ...leaveRequests.map((item) => ({
        id: item.id,
        type: 'Leave',
        label: item.status,
        date: item.createdAt.toISOString(),
        href: '/dashboard/leave',
      })),
      ...timesheets.map((item) => ({
        id: item.id,
        type: 'Timesheet',
        label: item.status,
        date: item.updatedAt.toISOString(),
        href: '/dashboard/timesheets',
      })),
      ...payrollRuns.map((item) => ({
        id: item.id,
        type: 'Payroll',
        label: item.status,
        date: item.updatedAt.toISOString(),
        href: '/dashboard/payroll/runs',
      })),
    ]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8);
  }

  private async getEmployeeLifecycleRows(
    currentUser: AuthenticatedUser,
    confirmationCutoff: Date,
  ) {
    const rows = await this.prisma.employee.findMany({
      where: this.employeeScopedWhere(currentUser, {
        OR: [
          { hireDate: { gte: new Date() } },
          {
            employmentStatus: EmployeeEmploymentStatus.PROBATION,
            confirmationDate: { lte: confirmationCutoff },
          },
        ],
      }),
      orderBy: { hireDate: 'asc' },
      take: 8,
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        hireDate: true,
        confirmationDate: true,
        employmentStatus: true,
        department: { select: { name: true } },
        designation: { select: { name: true } },
      },
    });

    return rows.map((employee) => ({
      id: employee.id,
      code: employee.employeeCode,
      employee: this.employeeName(employee),
      department: employee.department?.name ?? '-',
      designation: employee.designation?.name ?? '-',
      hireDate: employee.hireDate.toISOString().slice(0, 10),
      confirmationDate:
        employee.confirmationDate?.toISOString().slice(0, 10) ?? '-',
      status: employee.employmentStatus,
      href: `/dashboard/employees/${employee.id}`,
    }));
  }

  private async getDirectReportRows(where: Prisma.EmployeeWhereInput) {
    const rows = await this.prisma.employee.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 8,
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        employmentStatus: true,
        email: true,
        department: { select: { name: true } },
        designation: { select: { name: true } },
      },
    });

    return rows.map((employee) => ({
      id: employee.id,
      code: employee.employeeCode,
      employee: this.employeeName(employee),
      department: employee.department?.name ?? '-',
      designation: employee.designation?.name ?? '-',
      status: employee.employmentStatus,
      profile: employee.email ? 'Complete enough' : 'Missing email',
      href: `/dashboard/employees/${employee.id}`,
    }));
  }

  private employeeBaseWhere(
    currentUser: AuthenticatedUser,
    where: Prisma.EmployeeWhereInput = {},
  ): Prisma.EmployeeWhereInput {
    return {
      tenantId: currentUser.tenantId,
      isDeleted: false,
      deletedAt: null,
      ...where,
    };
  }

  private employeeScopedWhere(
    currentUser: AuthenticatedUser,
    where: Prisma.EmployeeWhereInput = {},
  ): Prisma.EmployeeWhereInput {
    const accessibleBusinessUnitIds =
      currentUser.accessContext?.accessibleBusinessUnitIds ?? [];
    const canUseBusinessUnitScope =
      !this.hasPrivilegedRole(currentUser) &&
      accessibleBusinessUnitIds.length > 0;

    return this.employeeBaseWhere(currentUser, {
      ...(canUseBusinessUnitScope
        ? { businessUnitId: { in: accessibleBusinessUnitIds } }
        : {}),
      ...where,
    });
  }

  private countEmployees(
    currentUser: AuthenticatedUser,
    where: Prisma.EmployeeWhereInput = {},
  ) {
    return this.prisma.employee.count({
      where: this.employeeScopedWhere(currentUser, where),
    });
  }

  private canViewAdminDashboard(currentUser: AuthenticatedUser) {
    return (
      this.hasPrivilegedRole(currentUser) ||
      this.hasAnyPermission(currentUser, [
        'settings.read',
        'tenant.settings.manage',
        'users.read',
        'roles.read',
      ])
    );
  }

  private canViewHrDashboard(currentUser: AuthenticatedUser) {
    return (
      this.hasPrivilegedRole(currentUser) ||
      currentUser.roleKeys.includes(ROLE_KEYS.HR) ||
      this.hasAnyPermission(currentUser, [
        'employees.read.all',
        'employees.read',
        'leave-requests.approve',
      ])
    );
  }

  private canViewManagerDashboard(
    currentUser: AuthenticatedUser,
    directReportsCount: number,
  ) {
    return (
      this.hasPrivilegedRole(currentUser) ||
      currentUser.roleKeys.includes(ROLE_KEYS.MANAGER) ||
      directReportsCount > 0 ||
      this.hasAnyPermission(currentUser, [
        'leave-requests.approve',
        'timesheets.approve',
      ])
    );
  }

  private canViewEmployeeDashboard(currentUser: AuthenticatedUser) {
    return (
      this.hasPrivilegedRole(currentUser) ||
      currentUser.roleKeys.includes(ROLE_KEYS.EMPLOYEE) ||
      this.hasAnyPermission(currentUser, [
        'leave-requests.create',
        'timesheets.read',
        'attendance.read',
      ])
    );
  }

  private resolveDefaultView(
    currentUser: AuthenticatedUser,
    views: DashboardView[],
  ) {
    const preferred = this.hasPrivilegedRole(currentUser)
      ? 'admin'
      : currentUser.roleKeys.includes(ROLE_KEYS.HR)
        ? 'hr'
        : currentUser.roleKeys.includes(ROLE_KEYS.MANAGER)
          ? 'manager'
          : 'employee';

    return (
      views.find((view) => view.key === preferred)?.key ??
      views[0]?.key ??
      'employee'
    );
  }

  private hasAnyPermission(
    currentUser: AuthenticatedUser,
    permissions: string[],
  ) {
    return permissions.some((permission) =>
      currentUser.permissionKeys.includes(permission),
    );
  }

  private hasPrivilegedRole(currentUser: AuthenticatedUser) {
    return currentUser.roleKeys.some((roleKey) =>
      PRIVILEGED_ROLES.has(roleKey),
    );
  }

  private actions(
    currentUser: AuthenticatedUser,
    actions: Array<DashboardAction & { permissionKey?: string }>,
  ): DashboardAction[] {
    return actions
      .filter((action) => ROUTES.has(action.href))
      .filter((action) =>
        action.permissionKey
          ? this.hasPrivilegedRole(currentUser) ||
            currentUser.permissionKeys.includes(action.permissionKey)
          : true,
      )
      .map((action) => ({
        key: action.key,
        label: action.label,
        href: action.href,
        description: action.description,
        icon: action.icon,
        variant: action.variant,
        badgeCount: action.badgeCount,
      }));
  }

  private action(
    key: string,
    label: string,
    href: string,
    permissionKey?: string,
  ): DashboardAction & { permissionKey?: string } {
    return { key, label, href, permissionKey };
  }

  private section(
    key: string,
    title: string,
    layout: DashboardSection['layout'],
    order: number,
    widgets: DashboardWidget[],
    description?: string,
  ): DashboardSection {
    return { key, title, description, layout, order, widgets };
  }

  private metric(
    key: string,
    title: string,
    value: number | string,
    subtitle: string,
    href?: string,
    severity: DashboardSeverity = 'neutral',
  ): DashboardWidget {
    return {
      key,
      title,
      type: 'metric-card',
      order: 10,
      value,
      subtitle,
      severity,
      action: href ? { key: `${key}Action`, label: 'Open', href } : undefined,
    };
  }

  private summaryWidget(
    key: string,
    title: string,
    type: DashboardWidgetType,
    data: unknown,
    href?: string,
  ): DashboardWidget {
    return {
      key,
      title,
      type,
      order: 10,
      data,
      action: href
        ? { key: `${key}Action`, label: 'View all', href }
        : undefined,
      emptyState: 'No records found for this widget.',
    };
  }

  private tableWidget(
    key: string,
    title: string,
    rows: unknown[],
    href?: string,
  ): DashboardWidget {
    return {
      key,
      title,
      type: 'table',
      order: 10,
      data: { rows },
      action: href
        ? { key: `${key}Action`, label: 'View all', href }
        : undefined,
      emptyState: 'No rows to show.',
    };
  }

  private exceptionWidget(
    key: string,
    title: string,
    rows: unknown[],
    href?: string,
  ): DashboardWidget {
    return {
      key,
      title,
      type: 'exception-list',
      order: 10,
      data: { rows },
      severity: rows.length ? 'warning' : 'good',
      action: href ? { key: `${key}Action`, label: 'Review', href } : undefined,
      emptyState: 'No active exceptions.',
    };
  }

  private insightWidget(
    key: string,
    title: string,
    items: unknown[],
  ): DashboardWidget {
    return {
      key,
      title,
      type: 'insight-list',
      order: 10,
      data: { items },
      emptyState: 'No insights need attention.',
    };
  }

  private kpiWidget(
    key: string,
    title: string,
    data: { complete: number; total: number; items: unknown[] },
  ): DashboardWidget {
    return {
      key,
      title,
      type: 'compliance-status',
      order: 10,
      value: `${data.complete}/${data.total}`,
      severity: data.complete === data.total ? 'good' : 'warning',
      data,
    };
  }

  private profileWidget(
    employee: CurrentEmployee | null,
    profileGaps: string[],
  ): DashboardWidget {
    return {
      key: 'profileSummary',
      title: 'Profile summary',
      type: 'profile-summary',
      order: 10,
      severity: profileGaps.length ? 'warning' : 'good',
      data: employee
        ? {
            employeeCode: employee.employeeCode,
            name: this.employeeName(employee),
            manager: employee.manager
              ? this.employeeName(employee.manager)
              : null,
            department: employee.department?.name ?? null,
            designation: employee.designation?.name ?? null,
            status: employee.employmentStatus,
            joiningDate: employee.hireDate.toISOString().slice(0, 10),
            gaps: profileGaps,
          }
        : { gaps: profileGaps },
      action: {
        key: 'profile',
        label: 'Open profile',
        href: '/dashboard/profile',
      },
    };
  }

  private quickActionsWidget(
    key: string,
    actions: DashboardAction[],
  ): DashboardWidget {
    return {
      key,
      title: 'Quick actions',
      type: 'quick-actions',
      order: 10,
      actions,
      emptyState: 'No actions are available for your access level.',
    };
  }

  private row(
    key: string,
    label: string,
    value: number | string,
    href?: string,
    status: DashboardSeverity = 'neutral',
  ) {
    return { key, label, value, href, status };
  }

  private setupItem(
    key: string,
    label: string,
    configured: boolean,
    href: string,
  ) {
    return {
      key,
      label,
      value: configured ? 'Configured' : 'Needs setup',
      href,
      status: configured ? 'good' : 'warning',
    };
  }

  private getProfileGaps(employee: CurrentEmployee) {
    return [
      employee.email ? null : 'work email',
      employee.managerEmployeeId ? null : 'manager',
      employee.departmentId ? null : 'department',
      employee.designationId ? null : 'designation',
      employee.employeeLevelId ? null : 'employee level',
      employee.ownerUserId ? null : 'owner',
    ].filter((gap): gap is string => Boolean(gap));
  }

  private employeeName(employee: {
    employeeCode?: string | null;
    firstName: string;
    lastName: string;
  }) {
    const name = `${employee.firstName} ${employee.lastName}`.trim();
    return employee.employeeCode ? `${name} (${employee.employeeCode})` : name;
  }

  private getStartOfMonth() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  private getTodayRange() {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    return { start, end };
  }
}
