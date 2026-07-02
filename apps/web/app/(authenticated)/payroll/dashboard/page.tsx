import { DashboardSectionRenderer } from "@/app/components/dashboard/dashboard-section-renderer";
import type {
  DashboardSection,
  DashboardWidget,
} from "@/app/components/dashboard/types";
import { getSessionUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { PayrollLayoutShell } from "../_components/payroll-layout-shell";

type Row = { label: string; value: number };
type DashboardResponse = {
  latestRunId: string | null;
  widgets: {
    payrollRuns: number;
    readyEmployees: number;
    blockedEmployees: number;
    missingBankAccounts: number;
    missingCompensation: number;
    missingTaxProfiles: number;
    pendingClaims: number;
    pendingLoans: number;
    attendanceExceptions: number;
    payrollCostTrend: Row[];
    payrollCostByDepartment: Row[];
    payrollCostByBusinessUnit: Row[];
    payrollCostByLegalEntity: Row[];
    payslipDeliveryStatus: Record<string, number>;
  };
};

export default async function PayrollDashboardPage() {
  const user = await getSessionUser();
  if (
    !user ||
    !hasPermission(user.permissionKeys, "payroll-operations.dashboard")
  ) {
    return (
      <AccessDeniedState
        title="Access denied"
        description="Payroll operations dashboard access is required."
      />
    );
  }
  const response = await apiRequestJson<DashboardResponse>(
    "/payroll/operations/dashboard",
  );
  const exceptionUrl = (category?: string) => {
    const params = new URLSearchParams();
    if (response.latestRunId) params.set("runId", response.latestRunId);
    if (category) params.set("category", category);
    const query = params.toString();
    return `/payroll/exceptions${query ? `?${query}` : ""}`;
  };
  const metric = (
    key: string,
    title: string,
    value: number,
    href: string,
    severity?: DashboardWidget["severity"],
  ): DashboardWidget => ({
    key,
    title,
    type: "metric-card",
    order: 0,
    value,
    severity,
    action: { key: `${key}-open`, label: "Open", href },
  });
  const sections: DashboardSection[] = [
    {
      key: "readiness",
      title: "Payroll readiness",
      description: "Current payroll preparation and blocking conditions.",
      layout: "grid",
      order: 10,
      widgets: [
        metric(
          "runs",
          "Payroll Runs",
          response.widgets.payrollRuns,
          "/payroll/runs",
        ),
        metric(
          "ready",
          "Ready Employees",
          response.widgets.readyEmployees,
          exceptionUrl(),
          "good",
        ),
        metric(
          "blocked",
          "Blocked Employees",
          response.widgets.blockedEmployees,
          exceptionUrl(),
          response.widgets.blockedEmployees ? "critical" : "good",
        ),
        metric(
          "bank",
          "Missing Bank Accounts",
          response.widgets.missingBankAccounts,
          exceptionUrl("Bank Issues"),
          "warning",
        ),
        metric(
          "compensation",
          "Missing Compensation",
          response.widgets.missingCompensation,
          exceptionUrl("Compensation Issues"),
          "warning",
        ),
        metric(
          "tax",
          "Missing Tax Profiles",
          response.widgets.missingTaxProfiles,
          exceptionUrl("Tax Issues"),
          "warning",
        ),
        metric(
          "claims",
          "Pending Claims",
          response.widgets.pendingClaims,
          "/claims",
          "warning",
        ),
        metric(
          "loans",
          "Pending Loans",
          response.widgets.pendingLoans,
          "/loans",
          "warning",
        ),
        metric(
          "attendance",
          "Attendance Exceptions",
          response.widgets.attendanceExceptions,
          exceptionUrl("Attendance Issues"),
          "warning",
        ),
      ],
    },
    {
      key: "costs",
      title: "Payroll costs",
      description: "Calculated net payroll values from frozen run results.",
      layout: "grid",
      order: 20,
      widgets: [
        chart("trend", "Payroll Cost Trend", response.widgets.payrollCostTrend),
        chart(
          "department",
          "Payroll Cost by Department",
          response.widgets.payrollCostByDepartment,
        ),
        chart(
          "business-unit",
          "Payroll Cost by Business Unit",
          response.widgets.payrollCostByBusinessUnit,
        ),
        chart(
          "legal-entity",
          "Payroll Cost by Legal Entity",
          response.widgets.payrollCostByLegalEntity,
        ),
        {
          key: "delivery",
          title: "Payslip Delivery Status",
          type: "payroll-summary",
          order: 50,
          data: response.widgets.payslipDeliveryStatus,
          action: {
            key: "delivery-open",
            label: "Open Delivery Center",
            href: "/payroll/payslips/delivery",
          },
        },
      ],
    },
  ];
  return (
    <PayrollLayoutShell
      title="Payroll Operations Dashboard"
      description="Go-live payroll readiness, costs, exceptions, and delivery status."
    >
      <div className="grid gap-8">
        {sections.map((section) => (
          <DashboardSectionRenderer key={section.key} section={section} />
        ))}
      </div>
    </PayrollLayoutShell>
  );
}

function chart(key: string, title: string, rows: Row[]): DashboardWidget {
  return {
    key,
    title,
    type: "chart",
    order: 10,
    data: { rows },
    emptyState: "No calculated payroll data.",
  };
}
