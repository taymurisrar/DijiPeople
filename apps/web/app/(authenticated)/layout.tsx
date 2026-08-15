import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { CSSProperties, cache } from "react";
import { requireSessionUser } from "@/lib/auth";
import { LOGIN_ROUTE } from "@/lib/auth-config";
import {
  buildBrandingCssVariables,
  BrandingSettings,
  resolveTenantBranding,
} from "@/lib/branding";
import { apiRequestJson } from "@/lib/server-api";
import { isSelfServiceUser } from "@/lib/permissions";
import {
  TenantFeaturesResponse,
  TenantResolvedSettingsResponse,
} from "./settings/types";
import { getCurrentEmployee } from "./_lib/current-employee";
import { getBusinessUnitAccessSummary } from "./_lib/business-unit-access";
import { AuthenticatedShellProvider } from "./_components/authenticated-shell-provider";
import { DashboardSidebar } from "./_components/dashboard-sidebar";
import type { DashboardNavOverride } from "./_components/navigation";
import { buildVisibilityPlacement } from "@/lib/runtime/visibility-placement";
import { DashboardTopbar } from "./_components/dashboard-topbar";
import { ErrorProvider } from "@/app/components/errors/error-provider";
import { SystemPreferencesProvider } from "./_components/resolved-settings-provider";
import { NotificationPopupProvider } from "./_components/notification-popup-provider";
import { resolveRouteTitle } from "@/lib/tenant-branding-client";
import { buildFaviconMetadata } from "@/lib/favicon-metadata";
import { WorkspaceEnvironmentBanner } from "@/app/components/workspace-environment-banner";
import { assertSessionMatchesWorkspace } from "@/lib/workspace-context";

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
  children: React.ReactNode;
}>) {
  const user = await requireSessionUser("/");

  if (!user) {
    redirect(LOGIN_ROUTE);
  }

  /*
   * A session proves who someone is, never which workspace they may open. A
   * valid session presented on another customer's hostname is refused here,
   * before any tenant data is fetched — the API would scope its reads to the
   * session's own tenant anyway, but rendering another customer's workspace
   * chrome around them is itself the leak.
   */
  const wrongWorkspaceRoute = await assertSessionMatchesWorkspace(user.tenantId);
  if (wrongWorkspaceRoute) {
    redirect(wrongWorkspaceRoute);
  }

  const roleLabel = user.roleKeys?.[0] ?? "Tenant User";
  const selfService = isSelfServiceUser(user.permissionKeys);

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
    ).catch(() => ({ item: null })),
    /*
     * A failure here falls back to the code-defined sidebar rather than an
     * empty one: losing a tenant's customization is recoverable, losing all
     * navigation is not.
     */
    apiRequestJson<DashboardNavOverride[]>("/navigation/sidebar").catch(
      () => [] as DashboardNavOverride[],
    ),
  ]);

  const currentEmployee = currentEmployeeContext.employee;
  const isReportingManager = currentEmployeeContext.isReportingManager;

  const avatarSrc = currentEmployee?.profileImage
    ? `/api/employees/${currentEmployee.id}/profile-image`
    : null;

  const avatarCacheKey =
    currentEmployee?.profileImage?.id ??
    currentEmployee?.profileImage?.createdAt ??
    null;

  const effectiveTenantName =
    resolvedSettings?.branding.shortBrandName ||
    resolvedSettings?.branding.brandName ||
    resolvedSettings?.organization.companyDisplayName ||
    user.tenantName;

  const brandingSettings = resolveTenantBranding({
    ...resolvedSettings?.branding,
    tenantName:
      resolvedSettings?.organization.companyDisplayName ?? user.tenantName,
  });
  const themeStyle = buildTenantThemeStyle(brandingSettings);

  const sessionTimeoutMinutes = Math.max(
    15,
    resolvedSettings?.security.sessionTimeoutMinutes ??
      resolvedSettings?.system.autoLogoutMinutes ??
      15,
  );

  return (
    <SystemPreferencesProvider initialResolvedSettings={resolvedSettings}>
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
          Non-production workspaces are marked before anything else renders, so
          the marker is visible on every screen rather than only where someone
          remembered to add it.
        */}
        <WorkspaceEnvironmentBanner />
        <div
          className="dp-theme-scope min-h-screen bg-background py-2 md:py-4"
          data-theme={
            resolvedSettings?.branding.defaultThemeMode?.toLowerCase() ||
            resolvedSettings?.system.defaultThemeMode?.toLowerCase() ||
            "light"
          }
          style={themeStyle}
        >
          <div className="mx-4 flex gap-6">
            <DashboardSidebar
              enabledFeatureKeys={featureAvailability?.enabledKeys ?? null}
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
                canReadInbox={user.permissionKeys.includes("inbox.read")}
                email={user.email}
                firstName={user.firstName}
                lastName={user.lastName}
                profileHref="/my-profile"
                roleLabel={roleLabel}
                tenantId={user.tenantId}
                tenantName={effectiveTenantName}
              />

              <ErrorProvider user={{ roleKeys: user.roleKeys }}>
                <NotificationPopupProvider />
                {timesheetRestriction.item ? (
                  <div
                    className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm"
                    role="alert"
                  >
                    <p className="font-semibold">
                      Timesheet action required ·{" "}
                      {timesheetRestriction.item.restrictionMode
                        .replaceAll("_", " ")
                        .toLowerCase()}
                    </p>
                    <p className="mt-1">
                      {timesheetRestriction.item.reason}{" "}
                      <Link
                        className="font-semibold underline"
                        href="/timesheets"
                      >
                        Open Timesheets
                      </Link>
                    </p>
                  </div>
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
  item: null | {
    id: string;
    reason: string;
    restrictionMode: string;
    startAt: string;
    expiryAt?: string | null;
  };
};

function buildTenantThemeStyle(brandingTokens: BrandingSettings) {
  return buildBrandingCssVariables(brandingTokens) as CSSProperties;
}
