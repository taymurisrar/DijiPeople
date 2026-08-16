import type { NextConfig } from "next";
import {
  validateDeploymentEnv,
  securityHeadersForApp,
  getApiBaseUrl,
} from "@repo/config";

validateDeploymentEnv(process.env, { app: "web" });

const nextConfig: NextConfig = {
  /*
   * BUG-0040 — this app shipped no security response headers at all.
   *
   * Defined once in @repo/config and shared by all three apps: three copies
   * of a header policy drift, and the drift is invisible until an audit.
   *
   * The CSP is Report-Only on purpose. It is the one header here that can
   * break a working product, and it has never been observed in a real
   * browser against this build. Clickjacking protection is NOT deferred with
   * it — X-Frame-Options is enforced immediately. See ITEM-0039.
   */
  async headers() {
    return securityHeadersForApp({ apiOrigin: getApiBaseUrl() });
  },
  poweredByHeader: false,
  output: process.env.NEXT_STANDALONE === "true" ? "standalone" : undefined,
  async redirects() {
    const settingsRedirects = [
      [
        "/settings/organizations",
        "/settings/general-setup/organization/organizations",
      ],
      [
        "/settings/business-units",
        "/settings/general-setup/organization/business-units",
      ],
      [
        "/settings/departments",
        "/settings/general-setup/organization/departments",
      ],
      ["/settings/designations", "/settings/people/workforce/designations"],
      [
        "/settings/employee-levels",
        "/settings/people/workforce/employee-levels",
      ],
      ["/settings/locations", "/settings/people/work-management/work-sites"],
      ["/settings/work-sites", "/settings/people/work-management/work-sites"],
      [
        "/settings/work-calendars",
        "/settings/people/work-management/work-calendars",
      ],
      [
        "/settings/holiday-calendars",
        "/settings/people/work-management/holiday-calendars",
      ],
      ["/settings/shifts", "/settings/people/work-management/shifts"],
      ["/settings/tenant", "/settings/general-setup/tenant/tenant-profile"],
      ["/settings/employees", "/settings/people/workforce/employee-settings"],
      ["/settings/documents", "/settings/people/documents/documents"],
      ["/settings/attendance", "/settings/people/attendance/attendance"],
      [
        "/settings/system",
        "/settings/appearance/experience/system-preferences",
      ],
      ["/settings/recruitment", "/settings/general-setup/modules/recruitment"],
      ["/settings/access/users", "/settings/security-access/identities/users"],
      [
        "/settings/security-access/users",
        "/settings/security-access/identities/users",
      ],
      [
        "/settings/access/roles",
        "/settings/security-access/authorization/roles",
      ],
      ["/settings/leave-types", "/settings/people/leave/leave-types"],
      [
        "/settings/pay-components",
        "/settings/payroll/configuration/pay-components",
      ],
      [
        "/settings/overtime-policies",
        "/settings/payroll/configuration/overtime-policies",
      ],
      [
        "/settings/time-payroll-policies",
        "/settings/payroll/configuration/time-payroll-policies",
      ],
      [
        "/settings/payroll/regions",
        "/settings/regional/payroll-geography/payroll-regions",
      ],
      [
        "/settings/payroll/exchange-rates",
        "/settings/regional/currency/exchange-rates",
      ],
      [
        "/settings/payroll/gl-accounts",
        "/settings/payroll/configuration/gl-accounts",
      ],
      [
        "/settings/payroll/posting-rules",
        "/settings/payroll/configuration/posting-rules",
      ],
      [
        "/settings/access/permissions",
        "/settings/security-access/authorization/permissions",
      ],
      [
        "/settings/notifications/logs",
        "/settings/notifications/delivery/delivery-logs",
      ],
      ["/settings/audit", "/settings/audit-compliance/history/audit-events"],
      ["/settings/countries", "/settings/regional/geography/countries"],
      ["/settings/regions", "/settings/regional/geography/regions"],
      ["/settings/timezones", "/settings/regional/localization/timezones"],
      ["/settings/currencies", "/settings/regional/currency/currencies"],
      ["/settings/currency", "/settings/regional/currency/currencies"],
      [
        "/settings/fiscal-years",
        "/settings/regional/business-calendar/fiscal-years",
      ],
      [
        "/settings/business-date-rules",
        "/settings/regional/business-calendar/business-date-rules",
      ],
      [
        "/settings/field-security",
        "/settings/security-access/security-governance/field-security",
      ],
      [
        "/settings/password-login-policies",
        "/settings/security-access/security-governance/password-login-policies",
      ],
      [
        "/settings/login-history",
        "/settings/security-access/security-governance/login-history",
      ],
      ["/settings/payroll-periods", "/settings/payroll/cycles/payroll-periods"],
      [
        "/settings/salary-package-rules",
        "/settings/payroll/configuration/salary-package-rules",
      ],
      [
        "/settings/benefit-policies",
        "/settings/payroll/benefits/benefit-policies",
      ],
      ["/settings/loan-policies", "/settings/payroll/loans/loan-policies"],
      ["/settings/banks", "/settings/payroll/banking/banks"],
      [
        "/settings/delegation-rules",
        "/settings/approvals/routing/delegation-rules",
      ],
      [
        "/settings/escalation-rules",
        "/settings/approvals/routing/escalation-rules",
      ],
      [
        "/settings/workflow-templates",
        "/settings/approvals/templates/workflow-templates",
      ],
      [
        "/settings/retention-rules",
        "/settings/audit-compliance/retention/retention-rules",
      ],
      [
        "/settings/data-access-history",
        "/settings/audit-compliance/history/data-access-history",
      ],
    ] as const;

    return settingsRedirects.flatMap(([source, destination]) => [
      { source, destination, permanent: false },
      {
        source: `${source}/:path*`,
        destination: `${destination}/:path*`,
        permanent: false,
      },
    ]);
  },
};

export default nextConfig;
