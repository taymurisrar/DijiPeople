import type { CSSProperties, ReactNode } from "react";
import { Suspense, cache } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

import { WorkspaceSwitcher } from "@/app/components/workspace-switcher";
import { ErrorProvider } from "@/app/components/errors/error-provider";
import { WorkspaceEnvironmentBanner } from "@/app/components/workspace-environment-banner";

import { requireSessionUser } from "@/lib/auth";
import { LOGIN_ROUTE } from "@/lib/auth-config";
import {
  buildBrandingCssVariables,
  resolveTenantBranding,
} from "@/lib/branding";
import type { BrandingSettings } from "@/lib/branding";
import { buildFaviconMetadata } from "@/lib/favicon-metadata";
import { isSelfServiceUser } from "@/lib/permissions";
import { buildVisibilityPlacement } from "@/lib/runtime/visibility-placement";
import { apiRequestJson } from "@/lib/server-api";
import { resolveRouteTitle } from "@/lib/tenant-branding-client";
import { assertSessionMatchesWorkspace } from "@/lib/workspace-context";

import { getBusinessUnitAccessSummary } from "./_lib/business-unit-access";
import { getCurrentEmployee } from "./_lib/current-employee";

import { AuthenticatedShellProvider } from "./_components/authenticated-shell-provider";
import { DashboardSidebar } from "./_components/dashboard-sidebar";
import { DashboardTopbar } from "./_components/dashboard-topbar";
import type { DashboardNavOverride } from "./_components/navigation";
import { NotificationPopupProvider } from "./_components/notification-popup-provider";
import { SystemPreferencesProvider } from "./_components/resolved-settings-provider";

import type {
  TenantFeaturesResponse,
  TenantResolvedSettingsResponse,
} from "./settings/types";

const getResolvedTenantSettings = cache(() =>
  apiRequestJson<TenantResolvedSettingsResponse>(
    "/tenant-settings/resolved",
  ).catch(() => null),
);

export async function generateMetadata(): Promise<Metadata> {
  const [resolvedSettings, requestHeaders] = await Promise.all([
    getResolvedTenantSettings(),
    headers(),
  ]);

  const branding = resolveTenantBranding({
    ...resolvedSettings?.branding,
    tenantName: resolvedSettings?.organization.companyDisplayName,
  });

  const pageTitle = resolveRouteTitle(
    requestHeaders.get("x-dijipeople-pathname") ?? "/",
  );

  return {
    title: pageTitle
      ? `${pageTitle} | ${branding.appTitle}`
      : branding.appTitle,
    icons: buildFaviconMetadata(branding.faviconUrl),
  };
}

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  /*
   * Authentication establishes the user's identity.
   * Workspace authorization is validated separately below.
   */
  const user = await requireSessionUser("/");

  if (!user) {
    redirect(LOGIN_ROUTE);
  }

  /*
   * A valid session does not automatically authorize access to whichever
   * workspace hostname it is presented on.
   *
   * Validate the current workspace before loading tenant-scoped data so the
   * application never renders one customer's shell around another customer's
   * authenticated session.
   */
  const wrongWorkspaceRoute = await assertSessionMatchesWorkspace(
    user.tenantId,
  );

  if (wrongWorkspaceRoute) {
    redirect(wrongWorkspaceRoute);
  }

  /*
   * roleKeys are internal identifiers and should not be displayed directly.
   *
   * Examples:
   * SYSTEM_ADMIN   -> System Admin
   * HR_MANAGER     -> HR Manager
   * payroll-admin  -> Payroll Admin
   */
  const roleLabel = formatRoleLabel(
    user.roleKeys?.[0] ?? "Tenant User",
  );

  const selfService = isSelfServiceUser(user.permissionKeys);

  /*
   * Load independent dashboard-shell dependencies concurrently.
   *
   * Optional shell features fail gracefully so a temporary service failure
   * does not make the entire authenticated application unavailable.
   */
  const [
    featureAvailability,
    currentEmployeeContext,
    resolvedSettings,
    businessUnitAccess,
    timesheetRestriction,
    navOverrides,
  ] = await Promise.all([
    apiRequestJson<TenantFeaturesResponse>(
      "/tenant-settings/features/availability",
    ).catch(() => null),

    getCurrentEmployee().catch(() => ({
      employee: null,
      isReportingManager: false,
    })),

    getResolvedTenantSettings(),

    getBusinessUnitAccessSummary(),

    apiRequestJson<TimesheetRestrictionResponse>(
      "/timesheets/access-restriction",
    ).catch(() => ({
      item: null,
    })),

    /*
     * Sidebar customization is optional.
     *
     * If loading it fails, use the application-defined navigation instead of
     * rendering an empty sidebar.
     */
    apiRequestJson<DashboardNavOverride[]>(
      "/navigation/sidebar",
    ).catch(() => [] as DashboardNavOverride[]),
  ]);

  const currentEmployee = currentEmployeeContext.employee;
  const isReportingManager =
    currentEmployeeContext.isReportingManager;

  /*
   * Profile images stay behind the application's authenticated image route.
   * This avoids exposing storage details or requiring clients to understand
   * the underlying employee image implementation.
   */
  const avatarSrc = currentEmployee?.profileImage
    ? `/api/employees/${currentEmployee.id}/profile-image`
    : null;

  /*
   * Used by the avatar component to invalidate a previously cached profile
   * image when the employee uploads a replacement.
   */
  const avatarCacheKey =
    currentEmployee?.profileImage?.id ??
    currentEmployee?.profileImage?.createdAt ??
    null;

  /*
   * Prefer tenant-configured branding, while retaining the authenticated
   * tenant's name as the final fallback.
   */
  const effectiveTenantName =
    resolvedSettings?.branding.shortBrandName ||
    resolvedSettings?.branding.brandName ||
    resolvedSettings?.organization.companyDisplayName ||
    user.tenantName;

  const brandingSettings = resolveTenantBranding({
    ...resolvedSettings?.branding,
    tenantName:
      resolvedSettings?.organization.companyDisplayName ??
      user.tenantName,
  });

  const themeStyle = buildTenantThemeStyle(brandingSettings);

  /*
   * Never allow tenant configuration to reduce inactivity timeout below the
   * application's security floor.
   */
  const sessionTimeoutMinutes = Math.max(
    15,
    resolvedSettings?.security.sessionTimeoutMinutes ??
      resolvedSettings?.system.autoLogoutMinutes ??
      15,
  );

  /*
   * Workspace switching belongs to the identity menu because it changes the
   * user's active session context rather than the current page.
   *
   * It stays behind Suspense because workspace discovery is supplementary
   * shell functionality. A slow `/workspaces/mine` request must not delay the
   * primary navigation or account controls.
   *
   * WorkspaceSwitcher itself renders null when there is nothing to switch to,
   * so the Suspense fallback should also remain null.
   */
  const workspaceSection = (
    <Suspense fallback={null}>
      <WorkspaceSwitcher />
    </Suspense>
  );

  return (
    <SystemPreferencesProvider
      initialResolvedSettings={resolvedSettings}
    >
      <AuthenticatedShellProvider
        inactivityTimeoutMinutes={sessionTimeoutMinutes}
        user={{
          avatarCacheKey,
          avatarSrc,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          permissionKeys: user.permissionKeys,
          profileHref: "/my-profile",
          roleLabel,
          roleKeys: user.roleKeys,
          tenantId: user.tenantId,
          tenantSlug: user.tenantSlug,
          businessUnitAccess,
        }}
      >
        {/*
         * Keep the environment marker outside the themed dashboard shell so a
         * non-production workspace remains immediately identifiable on every
         * authenticated screen.
         */}
        <WorkspaceEnvironmentBanner />

        <div
          className="
            dp-theme-scope
            min-h-screen
            bg-background
            py-2
            md:py-4
          "
          data-theme={
            resolvedSettings?.branding.defaultThemeMode?.toLowerCase() ||
            resolvedSettings?.system.defaultThemeMode?.toLowerCase() ||
            "light"
          }
          style={themeStyle}
        >
          <div className="mx-4 flex gap-6">
            <DashboardSidebar
              enabledFeatureKeys={
                featureAvailability?.enabledKeys ?? null
              }
              isReportingManager={isReportingManager}
              isSelfService={selfService}
              permissionKeys={user.permissionKeys}
              roleKeys={user.roleKeys}
              tenantId={user.tenantId}
              tenantName={effectiveTenantName}
              businessUnitAccess={businessUnitAccess}
              brandLogoUrl={brandingSettings.logoUrl}
              brandName={brandingSettings.brandName}
              brandTagline={brandingSettings.portalTagline}
              navOverrides={navOverrides}
              placement={buildVisibilityPlacement(currentEmployee)}
            />

            <div className="flex min-w-0 flex-1 flex-col gap-6">
              <DashboardTopbar
                avatarCacheKey={avatarCacheKey}
                avatarSrc={avatarSrc}
                canReadInbox={user.permissionKeys.includes(
                  "inbox.read",
                )}
                email={user.email}
                firstName={user.firstName}
                lastName={user.lastName}
                profileHref="/my-profile"
                roleLabel={roleLabel}
                tenantName={effectiveTenantName}
                workspaceSection={workspaceSection}
              />

              <ErrorProvider
                user={{
                  roleKeys: user.roleKeys,
                }}
              >
                <NotificationPopupProvider />

                {timesheetRestriction.item ? (
                  <TimesheetRestrictionBanner
                    item={timesheetRestriction.item}
                  />
                ) : null}

                {children}
              </ErrorProvider>
            </div>
          </div>
        </div>
      </AuthenticatedShellProvider>
    </SystemPreferencesProvider>
  );
}

type TimesheetRestrictionResponse = {
  item: TimesheetRestriction | null;
};

type TimesheetRestriction = {
  id: string;
  reason: string;
  restrictionMode: string;
  startAt: string;
  expiryAt?: string | null;
};

function TimesheetRestrictionBanner({
  item,
}: {
  item: TimesheetRestriction;
}) {
  return (
    <div
      className="
        rounded-2xl
        border border-amber-300
        bg-amber-50
        px-4 py-3
        text-sm text-amber-950
        shadow-sm
      "
      role="alert"
    >
      <p className="font-semibold">
        Timesheet action required
        <span aria-hidden="true"> · </span>
        <span>
          {formatRestrictionMode(item.restrictionMode)}
        </span>
      </p>

      <p className="mt-1">
        {item.reason}{" "}
        <Link
          className="
            font-semibold
            underline
            decoration-amber-700/50
            underline-offset-2
            transition-colors
            hover:decoration-amber-900
            focus-visible:rounded-sm
            focus-visible:outline-none
            focus-visible:ring-2
            focus-visible:ring-amber-700
            focus-visible:ring-offset-2
            focus-visible:ring-offset-amber-50
          "
          href="/timesheets"
        >
          Open Timesheets
        </Link>
      </p>
    </div>
  );
}

/**
 * Convert an internal role key into a human-readable UI label.
 *
 * Acronyms that users expect to remain uppercase are handled explicitly.
 */
function formatRoleLabel(value: string): string {
  const acronymMap: Record<string, string> = {
    admin: "Admin",
    api: "API",
    ceo: "CEO",
    cfo: "CFO",
    cio: "CIO",
    coo: "COO",
    crm: "CRM",
    cto: "CTO",
    hr: "HR",
    hris: "HRIS",
    it: "IT",
    qa: "QA",
    uat: "UAT",
  };

  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      const normalized = word.toLowerCase();

      return (
        acronymMap[normalized] ??
        normalized.charAt(0).toUpperCase() +
          normalized.slice(1)
      );
    })
    .join(" ");
}

function formatRestrictionMode(value: string): string {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function buildTenantThemeStyle(
  brandingTokens: BrandingSettings,
): CSSProperties {
  return buildBrandingCssVariables(
    brandingTokens,
  ) as CSSProperties;
}