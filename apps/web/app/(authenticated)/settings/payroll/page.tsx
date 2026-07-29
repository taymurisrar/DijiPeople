import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
} from "lucide-react";
import { apiRequestJson } from "@/lib/server-api";
import { getSessionUser } from "@/lib/auth";
import { hasAnyPermission } from "@/lib/permissions";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { SettingsShell } from "../_components/settings-shell";

const PAYROLL_SETTINGS_ACCESS = [
  "payroll.settings.read",
  "payroll-calendars.read",
  "payroll-periods.read",
  "pay-components.read",
  "claim-types.read",
  "tada-policies.read",
  "time-payroll-policies.read",
  "overtime-policies.read",
  "tax-rules.read",
  "payroll-gl.read",
  "benefits.read",
  "loans.read-all",
  "employee-bank-accounts.read",
] as const;

type PayrollHealth = {
  completenessPercentage: number;
  ready: boolean;
  checks: Array<{ label: string; ready: boolean }>;
  missing: string[];
};

const groups = [
  {
    title: "Payroll Foundation",
    items: [
      [
        "Payroll Settings",
        "Defaults, controls, payment and reporting settings.",
        "/settings/payroll/configuration/payroll-settings",
      ],
      [
        "Payroll Regions",
        "Currency, timezone and organization payroll scope.",
        "/settings/payroll/configuration/payroll-regions",
      ],
      [
        "Payroll Calendars",
        "Pay dates, cutoffs and period generation rules.",
        "/payroll/calendars",
      ],
      [
        "Payroll Cycles",
        "Employee scope and recurring payroll execution.",
        "/payroll/cycles",
      ],
      [
        "Payroll Periods",
        "Open, approve and lock pay periods.",
        "/payroll/periods",
      ],
    ],
  },
  {
    title: "Compensation",
    items: [
      [
        "Pay Components",
        "Reusable earnings, deductions and contributions.",
        "/settings/payroll/configuration/pay-components",
      ],
      [
        "Compensation Packages",
        "Package components, eligibility and defaults.",
        "/settings/payroll/configuration/salary-package-rules",
      ],
      [
        "Employee Compensation",
        "Effective assignments and payroll snapshots.",
        "/payroll/employee-compensation",
      ],
      [
        "Benefit Plans",
        "Enrollment, contributions and payroll behavior.",
        "/settings/payroll/benefits/benefit-policies",
      ],
      [
        "Loan Plans",
        "Eligibility, terms and scheduled deductions.",
        "/settings/payroll/loans/loan-policies",
      ],
    ],
  },
  {
    title: "Time-Based Pay",
    items: [
      [
        "Time-Based Pay Rules",
        "Attendance and timesheet payroll inputs.",
        "/settings/payroll/configuration/time-payroll-policies",
      ],
      [
        "Overtime Rules",
        "Overtime eligibility, rates and limits.",
        "/settings/payroll/configuration/overtime-policies",
      ],
      [
        "Travel Allowance Rules",
        "Travel and daily allowance calculations.",
        "/settings/payroll/configuration/travel-allowance-policies",
      ],
      [
        "Claim Types",
        "Reimbursements and payroll claim mappings.",
        "/settings/payroll/configuration/claim-types",
      ],
    ],
  },
  {
    title: "Tax and Statutory",
    items: [
      [
        "Tax Policies",
        "Slabs, applicability and payroll tax outputs.",
        "/settings/payroll/configuration/tax-rules",
      ],
      [
        "Employee Tax Profiles",
        "Employee jurisdiction and tax-policy assignments.",
        "/settings/payroll/configuration/employee-tax-profiles",
      ],
      [
        "Payroll Policies",
        "Search and govern all payroll policy families.",
        "/settings/payroll/policies",
      ],
    ],
  },
  {
    title: "Finance and Payment",
    items: [
      [
        "GL Accounts",
        "Payroll chart of accounts and dimensions.",
        "/settings/payroll/configuration/gl-accounts",
      ],
      [
        "Posting Rules",
        "Resolve payroll lines into balanced journals.",
        "/settings/payroll/configuration/posting-rules",
      ],
      ["Banks", "Tenant banking directory.", "/settings/payroll/banking/banks"],
      [
        "Employer Bank Accounts",
        "Funding accounts and bank export formats.",
        "/settings/payroll/banking/employer-bank-accounts",
      ],
      [
        "Payment Configuration",
        "Default accounts, modes and payment files.",
        "/settings/payroll/configuration/payroll-settings#payment-payslip",
      ],
    ],
  },
  {
    title: "Operations and Governance",
    items: [
      [
        "Setup Health",
        "Readiness checks and safe default initialization.",
        "/settings/payroll/configuration/payroll-settings",
      ],
      [
        "Approvals",
        "Payroll, loan and benefit approval routes.",
        "/settings/approval-matrices",
      ],
      [
        "Audit",
        "Configuration and payroll change history.",
        "/settings/system-audit",
      ],
      [
        "Imports and Exports",
        "Configuration templates and data transfer.",
        "/settings/payroll/configuration/pay-components",
      ],
    ],
  },
] as const;

const setupSequence = [
  [
    "Payroll Settings",
    "/settings/payroll/configuration/payroll-settings",
    null,
  ],
  [
    "Payroll Region and Calendar",
    "/settings/payroll/configuration/payroll-regions",
    "Payroll calendar",
  ],
  [
    "Pay Components",
    "/settings/payroll/configuration/pay-components",
    "Pay components",
  ],
  [
    "Compensation Packages",
    "/settings/payroll/configuration/salary-package-rules",
    "Compensation package",
  ],
  ["Tax Policies", "/settings/payroll/configuration/tax-rules", "Tax policies"],
  ["GL Accounts", "/settings/payroll/configuration/gl-accounts", "GL accounts"],
  [
    "Posting Rules",
    "/settings/payroll/configuration/posting-rules",
    "Posting rules",
  ],
  ["Payroll Cycle", "/payroll/cycles", "Payroll cycle"],
  ["Employee Assignments", "/payroll/employee-compensation", null],
  ["Payroll Run", "/payroll/runs", "Payroll periods"],
] as const;

export default async function PayrollSettingsCategoryPage() {
  const user = await getSessionUser();
  if (
    !user ||
    !hasAnyPermission(user.permissionKeys, PAYROLL_SETTINGS_ACCESS)
  ) {
    return (
      <AccessDeniedState
        title="Access denied"
        description="Payroll and Finance settings access is required."
      />
    );
  }

  const health = await apiRequestJson<PayrollHealth>(
    "/payroll/configuration/health",
  );
  const readyChecks = new Map(
    health.checks.map((check) => [check.label, check.ready]),
  );

  return (
    <SettingsShell
      eyebrow="Payroll setup"
      title="Payroll configuration"
      description="Configure payroll in sequence, then maintain each area from one compact workspace."
    >
      <section className="rounded-[22px] border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-foreground">
              Configuration sequence
            </h2>
            <p className="mt-1 text-sm text-muted">
              Complete the foundation before running payroll.
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${health.ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}
          >
            {health.completenessPercentage}% ready
          </span>
        </div>
        <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {setupSequence.map(([label, href, check], index) => {
            const ready = check
              ? readyChecks.get(check) === true
              : health.ready;
            const status = ready
              ? "Ready"
              : index === 0
                ? "Needs attention"
                : "Not configured";
            return (
              <li key={label}>
                <Link
                  href={href}
                  className="flex h-full items-start gap-3 rounded-xl border border-border px-3 py-2.5 transition hover:border-accent/30 hover:bg-accent-soft/30"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold">
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">
                      {label}
                    </span>
                    <span
                      className={`mt-1 flex items-center gap-1 text-xs ${ready ? "text-emerald-700" : "text-amber-700"}`}
                    >
                      {ready ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <CircleDashed className="h-3.5 w-3.5" />
                      )}
                      {status}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      {!health.ready ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Needs attention: {health.missing.join(", ")}.
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {groups.map((group) => (
          <section
            key={group.title}
            className="rounded-[22px] border border-border bg-surface p-4 shadow-sm"
          >
            <h2 className="px-1 text-sm font-semibold uppercase tracking-[0.12em] text-muted">
              {group.title}
            </h2>
            <div className="mt-2 divide-y divide-border/70">
              {group.items.map(([label, description, href]) => (
                <Link
                  key={label}
                  href={href}
                  className="group flex items-center gap-3 px-1 py-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground group-hover:text-accent">
                      {label}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {description}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted group-hover:text-accent" />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </SettingsShell>
  );
}
