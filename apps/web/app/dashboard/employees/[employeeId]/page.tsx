import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { getSessionUser } from "@/lib/auth";
import {
  formatDateTimeWithTenantSettings,
  formatDateWithTenantSettings,
} from "@/lib/date-format";
import {
  hasAnyPermission,
  hasPermission,
} from "@/lib/permissions";
import { EmployeeCompensationCard } from "../_components/employee-compensation-card";
import { EmployeeAccessCard } from "../_components/employee-access-card";
import { EmployeeDocumentsManager } from "../_components/employee-documents-manager";
import { EmployeeEducationManager } from "../_components/employee-education-manager";
import { EmployeeHistoryManager } from "../_components/employee-history-manager";
import { EmployeePersonalInfoForm } from "../_components/employee-personal-info-form";
import { EmployeeProfileImageCard } from "../_components/employee-profile-image-card";
import { EmployeePreviousEmploymentManager } from "../_components/employee-previous-employment-manager";
import { EmployeeResetPasswordButton } from "../_components/employee-reset-password-button";
import { EmployeeStatusBadge } from "../_components/employee-status-badge";
import { ManagerAssignmentForm } from "../_components/manager-assignment-form";
import { ReportingStructureSection } from "../_components/reporting-structure-section";
import { TerminateEmployeeButton } from "../_components/terminate-employee-button";
import { Button } from "@/app/components/ui/button";
import { AccessDeniedState } from "@/app/dashboard/_components/access-denied-state";
import {
  EmployeeHierarchyResponse,
  EmployeeListResponse,
  EmployeeProfile,
} from "../types";
import { TenantResolvedSettingsResponse } from "../../settings/types";

type EmployeeTabConfig = {
  key:
  | "overview"
  | "personal"
  | "employment"
  | "payroll"
  | "previous-employment"
  | "leave"
  | "attendance"
  | "timesheets"
  | "history"
  | "documents"
  | "education";
  label: string;
  requiredAnyPermissions?: readonly string[];
};

const employeeTabs: readonly EmployeeTabConfig[] = [
  { key: "overview", label: "Overview" },
  { key: "personal", label: "Personal Info" },
  { key: "employment", label: "Employment Info" },
  {
    key: "payroll",
    label: "Payroll / Compensation",
    requiredAnyPermissions: ["payroll.read"],
  },
  { key: "previous-employment", label: "Previous Employment" },
  {
    key: "leave",
    label: "Leave History",
    requiredAnyPermissions: ["leave-requests.read", "leaves.read"],
  },
  {
    key: "attendance",
    label: "Attendance",
    requiredAnyPermissions: ["attendance.read"],
  },
  {
    key: "timesheets",
    label: "Timesheets",
    requiredAnyPermissions: ["timesheets.read"],
  },
  { key: "history", label: "Employee History" },
  { key: "documents", label: "Documents" },
  { key: "education", label: "Education" },
] as const;

type EmployeeDetailPageProps = {
  params: Promise<{ employeeId: string }>;
  searchParams?: Promise<{ tab?: string }>;
};
type AttendanceHistoryEntry = {
  id: string;
  attendanceDate: string;
  attendanceStatus: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  attendanceMode: string;
  remoteAddressText?: string | null;
  officeLocation?: {
    name: string;
  } | null;
};

type AttendanceHistoryResponse = {
  items: AttendanceHistoryEntry[];
};

type TeamTimesheet = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalHours: number;
  entries: unknown[];
  employee?: {
    id: string;
  } | null;
};

type TeamTimesheetsResponse = {
  items: TeamTimesheet[];
};

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: EmployeeDetailPageProps) {
  const { employeeId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedTab = employeeTabs.some((tab) => tab.key === resolvedSearchParams.tab)
    ? (resolvedSearchParams.tab as EmployeeTabConfig["key"])
    : "overview";

  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    redirect("/login?reason=session-expired");
  }

  const visibleTabs = employeeTabs.filter(
    (tab) =>
      !tab.requiredAnyPermissions ||
      hasAnyPermission(sessionUser.permissionKeys, tab.requiredAnyPermissions),
  );

  const activeTab = visibleTabs.some((tab) => tab.key === requestedTab)
    ? requestedTab
    : visibleTabs[0]?.key ?? "overview";

  let employee: EmployeeProfile;
  let hierarchy: EmployeeHierarchyResponse;
  let managers: EmployeeListResponse;
  let resolvedSettings: TenantResolvedSettingsResponse | null = null;

  try {
    [employee, hierarchy, managers, resolvedSettings] = await Promise.all([
      apiRequestJson<EmployeeProfile>(`/employees/${employeeId}`),
      apiRequestJson<EmployeeHierarchyResponse>(`/employees/${employeeId}/hierarchy`),
      apiRequestJson<EmployeeListResponse>("/employees?pageSize=100"),
      apiRequestJson<TenantResolvedSettingsResponse>("/tenant-settings/resolved").catch(
        () => null,
      ),
    ]);
  } catch (error: unknown) {
    if (isUnauthorizedApiError(error)) {
      redirect("/login?reason=session-expired");
    }
    if (
      error instanceof ApiRequestError &&
      (error.status === 403 || error.status === 404)
    ) {
      return (
        <main className="dp-theme-scope dp-employees-scope grid gap-6">
          <AccessDeniedState
            description="This employee record is outside your accessible business-unit scope."
            title="You cannot view this employee record."
          />
        </main>
      );
    }

    throw error;
  }

  let attendanceHistory: AttendanceHistoryResponse | null = null;
  let teamTimesheets: TeamTimesheetsResponse | null = null;

  try {
    [attendanceHistory, teamTimesheets] = await Promise.all([
      activeTab === "attendance" && sessionUser.permissionKeys.includes("attendance.read")
        ? apiRequestJson<AttendanceHistoryResponse>(
          `/attendance/team?employeeId=${employeeId}&pageSize=20`,
        )
        : Promise.resolve(null),
      activeTab === "timesheets" && sessionUser.permissionKeys.includes("timesheets.read")
        ? apiRequestJson<TeamTimesheetsResponse>("/timesheets/team?pageSize=50")
        : Promise.resolve(null),
    ]);
  } catch (error: unknown) {
    if (isUnauthorizedApiError(error)) {
      redirect("/api/auth/logout?reason=session-expired");
    }

    throw error;
  }

  const canManageAccess = Boolean(
    hasPermission(sessionUser.permissionKeys, "employees.update") &&
    hasPermission(sessionUser.permissionKeys, "users.create") &&
    hasPermission(sessionUser.permissionKeys, "users.assign-roles"),
  );

  const canEditEmployee = hasPermission(sessionUser.permissionKeys, "employees.update");

  const canTerminateEmployee = hasPermission(
    sessionUser.permissionKeys,
    "employees.terminate",
  );

  const canResetPassword = hasPermission(
    sessionUser.permissionKeys,
    "employees.update",
  );

  const canManageReporting = hasPermission(
    sessionUser.permissionKeys,
    "employees.update",
  );

  const disallowedManagerIds = new Set([
    employee.id,
    ...hierarchy.directReports.map((directReport) => directReport.id),
  ]);

  const managerOptions = managers.items.filter(
    (candidate) => !disallowedManagerIds.has(candidate.id),
  );
  const formattingOptions = {
    dateFormat: resolvedSettings?.system.dateFormat || "MM/dd/yyyy",
    locale: resolvedSettings?.system.locale || "en-US",
    timeFormat: resolvedSettings?.system.timeFormat || "12h",
    timezone:
      resolvedSettings?.organization.timezone ||
      resolvedSettings?.system.defaultTimezone ||
      "UTC",
  };
  const formatDateValue = (value?: string | null) =>
    formatDateWithTenantSettings(value, formattingOptions);
  const formatDateTimeValue = (value?: string | null) =>
    formatDateTimeWithTenantSettings(value, formattingOptions);

  return (
    <main className="dp-theme-scope dp-employees-scope grid gap-6">
      <section className="rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(233,246,255,0.9))] p-8 shadow-lg">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm uppercase tracking-[0.18em] text-muted">
                Employee Profile
              </p>
              <EmployeeStatusBadge status={employee.employmentStatus} />
              {employee.isDraftProfile ? (
                <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">
                  Draft Employee
                </span>
              ) : null}
            </div>
            <div>
              <h1 className="font-serif text-4xl text-foreground">
                {employee.fullName}
              </h1>
              <p className="mt-2 text-muted">
                {[
                  employee.employeeCode,
                  employee.designation?.name || "No designation",
                  employee.department?.name || "No department",
                ].join(" • ")}
              </p>
            </div>
            <div className="grid gap-2 text-sm text-muted sm:grid-cols-2">
              <p>Work email: {employee.workEmail || "Not set"}</p>
              <p>Phone: {employee.phone || "Not set"}</p>
              <p>
                Reporting manager:{" "}
                {employee.reportingManager?.fullName || "No reporting manager assigned"}
              </p>
              <p>Hire date: {formatDateValue(employee.hireDate)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button href="/dashboard/employees" variant="secondary" size="md">
              Back to list
            </Button>
            {employee.isDraftProfile ? (
              <Link
                className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 transition hover:border-amber-400 hover:bg-amber-100"
                href={`/dashboard/recruitment/employee-drafts/${employee.id}`}
              >
                Continue draft essentials
              </Link>
            ) : null}
            {canEditEmployee ? (
              <Button
                href={`/dashboard/employees/${employee.id}/edit`}
                variant="primary"
                size="md"
              >
                Edit core profile
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <nav className="flex flex-wrap gap-2">
        {visibleTabs.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <Link
              key={tab.key}
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${isActive
                ? "bg-accent text-white"
                : "border border-border bg-surface text-foreground hover:border-accent/30 hover:text-accent"
                }`}
              href={`/dashboard/employees/${employee.id}?tab=${tab.key}`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {activeTab === "overview" ? (
        <section className="grid gap-6">
          <div className="grid gap-6 xl:grid-cols-[0.65fr_0.35fr]">
            <div className="grid gap-6">
              <OverviewGrid employee={employee} formatDate={formatDateValue} />
              <ReportingStructureSection
                directReports={hierarchy.directReports}
                employeeId={employee.id}
                managerChain={hierarchy.managerChain}
              />
            </div>

            <div className="grid gap-6">
              <EmployeeProfileImageCard
                employeeId={employee.id}
                employeeName={employee.fullName}
                profileImage={employee.profileImage}
              />

              {canManageReporting ? (
                <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
                  <p className="text-sm uppercase tracking-[0.18em] text-muted">
                    Reporting Manager
                  </p>
                  <p className="mt-3 text-sm text-muted">
                    Keep the primary reporting relationship accurate for approvals
                    and direct-report visibility.
                  </p>
                  <div className="mt-5">
                    <ManagerAssignmentForm
                      currentReportingManagerId={employee.reportingManagerEmployeeId}
                      employeeId={employee.id}
                      managerOptions={managerOptions}
                    />
                  </div>
                </article>
              ) : null}

              {canManageAccess || canResetPassword || canTerminateEmployee ? (
                <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
                  <p className="text-sm uppercase tracking-[0.18em] text-muted">
                    Admin Actions
                  </p>
                  <div className="mt-5 grid gap-4">
                    {(canManageAccess || employee.user) && (
                      <EmployeeAccessCard
                        canManageAccess={canManageAccess}
                        employee={employee}
                      />
                    )}
                    {canResetPassword ? (
                      <EmployeeResetPasswordButton employeeId={employee.id} />
                    ) : null}
                    {canTerminateEmployee ? (
                      <TerminateEmployeeButton employeeId={employee.id} />
                    ) : null}
                  </div>
                </article>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "personal" ? (
        <EmployeePersonalInfoForm employee={employee} />
      ) : null}

      {activeTab === "employment" ? (
        <section className="grid gap-6 xl:grid-cols-[0.65fr_0.35fr]">
          <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              Employment Information
            </p>
            <dl className="mt-5 grid gap-4 md:grid-cols-2">
              <DetailItem label="Employment status" value={employee.employmentStatus} />
              <DetailItem label="Employee type" value={employee.employeeType || "Not set"} />
              <DetailItem label="Work mode" value={employee.workMode || "Not set"} />
              <DetailItem label="Contract type" value={employee.contractType || "Not set"} />
              <DetailItem label="Hire date" value={formatDateValue(employee.hireDate)} />
              <DetailItem label="Confirmation date" value={formatDateValue(employee.confirmationDate)} />
              <DetailItem label="Probation end date" value={formatDateValue(employee.probationEndDate)} />
              <DetailItem label="Termination date" value={formatDateValue(employee.terminationDate)} />
              <DetailItem label="Department" value={employee.department?.name || "Not set"} />
              <DetailItem label="Designation" value={employee.designation?.name || "Not set"} />
              <DetailItem label="Location" value={employee.location?.name || "Not set"} />
              <DetailItem
                label="Official joining location"
                value={employee.officialJoiningLocation?.name || "Not set"}
              />
              <DetailItem
                label="Reporting manager"
                value={
                  employee.reportingManager?.fullName || "No reporting manager assigned"
                }
              />
              <DetailItem
                label="Notice period"
                value={
                  employee.noticePeriodDays
                    ? `${employee.noticePeriodDays} day(s)`
                    : "Not set"
                }
              />
              <DetailItem label="Tax identifier" value={employee.taxIdentifier || "Not set"} />
            </dl>
          </article>

          <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.18em] text-muted">
              Joining Stats
            </p>
            <div className="mt-5 grid gap-4">
              <Metric label="Years since joining" value={employee.derivedStats.yearsSinceJoining} />
              <Metric label="Days since joining" value={employee.derivedStats.daysSinceJoining} />
              <Metric label="Age" value={employee.derivedStats.age ?? 0} helper={employee.derivedStats.age === null ? "Not available" : undefined} />
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === "leave" ? (
        <LeaveHistorySection employee={employee} formatDate={formatDateValue} />
      ) : null}

      {activeTab === "payroll" ? (
        <EmployeeCompensationCard
          compensation={employee.currentCompensation}
          employeeId={employee.id}
        />
      ) : null}

      {activeTab === "previous-employment" ? (
        <EmployeePreviousEmploymentManager
          employeeId={employee.id}
          previousEmployments={employee.previousEmployments}
        />
      ) : null}

      {activeTab === "attendance" ? (
        <SimpleListSection
          emptyMessage="No attendance records found for this employee."
          items={
            (attendanceHistory?.items ?? []).map((entry: AttendanceHistoryEntry) => ({
              id: entry.id,
              title: `${formatDateValue(entry.attendanceDate)} • ${entry.attendanceStatus}`,
              detail: [
                entry.checkInAt ? `Check in: ${formatDateTimeValue(entry.checkInAt)}` : null,
                entry.checkOutAt
                  ? `Check out: ${formatDateTimeValue(entry.checkOutAt)}`
                  : "Check out pending",
                `Mode: ${entry.attendanceMode}`,
                entry.officeLocation?.name
                  ? `Location: ${entry.officeLocation.name}`
                  : entry.remoteAddressText
                    ? `Location: ${entry.remoteAddressText}`
                    : null,
              ]
                .filter((value): value is string => Boolean(value))
                .join(" • "),
            }))
          }
          title="Attendance"
        />
      ) : null}

      {activeTab === "timesheets" ? (
        <SimpleListSection
          emptyMessage="No timesheets found for this employee."
          items={
            (teamTimesheets?.items ?? [])
              .filter((timesheet: TeamTimesheet) => timesheet.employee?.id === employee.id)
              .map((timesheet: TeamTimesheet) => ({
                id: timesheet.id,
                title: `${formatDateValue(timesheet.periodStart)} to ${formatDateValue(timesheet.periodEnd)}`,
                detail: `${timesheet.status} • ${timesheet.totalHours} hours • ${timesheet.entries.length} entries`,
              }))
          }
          title="Timesheets"
        />
      ) : null}

      {activeTab === "history" ? (
        <EmployeeHistoryManager
          employeeId={employee.id}
          historyRecords={employee.employeeHistory}
        />
      ) : null}

      {activeTab === "documents" ? (
        <EmployeeDocumentsManager
          documents={employee.documents}
          employeeId={employee.id}
        />
      ) : null}

      {activeTab === "education" ? (
        <EmployeeEducationManager
          educationRecords={employee.educationRecords}
          employeeId={employee.id}
        />
      ) : null}
    </main>
  );
}

function isUnauthorizedApiError(error: unknown) {
  if (error instanceof ApiRequestError) {
    return error.status === 401;
  }

  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as {
    status?: number;
    response?: {
      status?: number;
    };
  };

  return candidate.status === 401 || candidate.response?.status === 401;
}

function OverviewGrid({
  employee,
  formatDate,
}: {
  employee: EmployeeProfile;
  formatDate: (value?: string | null) => string;
}) {
  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">Overview</p>
        <dl className="mt-5 grid gap-4">
          <DetailItem label="Full name" value={employee.fullName} />
          <DetailItem label="Employee code" value={employee.employeeCode} />
          <DetailItem label="Designation" value={employee.designation?.name || "Not set"} />
          <DetailItem label="Department" value={employee.department?.name || "Not set"} />
          <DetailItem
            label="Reporting manager"
            value={
              employee.reportingManager?.fullName || "No reporting manager assigned"
            }
          />
          <DetailItem label="Hire date" value={formatDate(employee.hireDate)} />
          <DetailItem label="Date of birth" value={formatDate(employee.dateOfBirth)} />
          <DetailItem
            label="Birthday"
            value={
              employee.derivedStats.birthdayToday
                ? "Today"
                : employee.derivedStats.daysUntilBirthday !== null
                  ? `${employee.derivedStats.daysUntilBirthday} day(s) away`
                  : "Not available"
            }
          />
        </dl>
      </article>

      <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <p className="text-sm uppercase tracking-[0.18em] text-muted">Contact</p>
        <dl className="mt-5 grid gap-4">
          <DetailItem label="Work email" value={employee.workEmail || "Not set"} />
          <DetailItem
            label="Personal email"
            value={employee.personalEmail || "Not set"}
          />
          <DetailItem label="Phone" value={employee.phone || "Not set"} />
          <DetailItem label="Alternate phone" value={employee.alternatePhone || "Not set"} />
          <DetailItem label="Nationality" value={employee.nationality || "Not set"} />
          <DetailItem label="CNIC" value={employee.cnic || "Not set"} />
          <DetailItem label="Blood group" value={employee.bloodGroup || "Not set"} />
        </dl>
      </article>
    </section>
  );
}

function LeaveHistorySection({
  employee,
  formatDate,
}: {
  employee: EmployeeProfile;
  formatDate: (value?: string | null) => string;
}) {
  if (employee.leaveHistory.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-border bg-surface p-6 text-sm text-muted shadow-sm">
        No leave history found for this employee.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-surface-strong text-left text-muted">
            <tr>
              <th className="px-5 py-4 font-medium">Leave type</th>
              <th className="px-5 py-4 font-medium">From</th>
              <th className="px-5 py-4 font-medium">To</th>
              <th className="px-5 py-4 font-medium">Days</th>
              <th className="px-5 py-4 font-medium">Status</th>
              <th className="px-5 py-4 font-medium">Approver</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-white/90">
            {employee.leaveHistory.map((record) => (
              <tr key={record.id}>
                <td className="px-5 py-4 font-medium text-foreground">{record.leaveType.name}</td>
                <td className="px-5 py-4 text-muted">{formatDate(record.startDate)}</td>
                <td className="px-5 py-4 text-muted">{formatDate(record.endDate)}</td>
                <td className="px-5 py-4 text-muted">{record.totalDays}</td>
                <td className="px-5 py-4 text-muted">{record.status}</td>
                <td className="px-5 py-4 text-muted">
                  {record.approver
                    ? `${record.approver.firstName} ${record.approver.lastName}`
                    : "Pending / not assigned"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}

function Metric({
  label,
  value,
  helper,
}: {
  label: string;
  value: number;
  helper?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white/80 px-4 py-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      {helper ? <p className="mt-1 text-xs text-muted">{helper}</p> : null}
    </div>
  );
}

function SimpleListSection({
  emptyMessage,
  items,
  title,
}: {
  emptyMessage: string;
  items: Array<{ id: string; title: string; detail: string }>;
  title: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-border bg-surface p-6 text-sm text-muted shadow-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <p className="text-sm uppercase tracking-[0.18em] text-muted">{title}</p>
      <div className="mt-5 grid gap-4">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-2xl border border-border bg-white/80 px-5 py-4"
          >
            <p className="font-medium text-foreground">{item.title}</p>
            <p className="mt-2 text-sm text-muted">{item.detail}</p>
          </div>
        ))}
      </div>
    </article>
  );
}
