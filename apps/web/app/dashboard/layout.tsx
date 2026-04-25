import { redirect } from "next/navigation";
import { CSSProperties } from "react";
import { requireSessionUser } from "@/lib/auth";
import { LOGIN_ROUTE } from "@/lib/auth-config";
import {
  buildBrandingCssVariables,
  BrandingSettings,
  resolveBrandingSettings,
} from "@/lib/branding";
import { apiRequestJson } from "@/lib/server-api";
import { BrandingHeadEffects } from "@/app/components/branding/branding-head-effects";
import { TenantFontSync } from "@/app/components/branding/tenant-font-sync";
import { isSelfServiceUser } from "@/lib/permissions";
import {
  TenantFeaturesResponse,
  TenantResolvedSettingsResponse,
} from "./settings/types";
import { getCurrentEmployee } from "./_lib/current-employee";
import { getBusinessUnitAccessSummary } from "./_lib/business-unit-access";
import { AuthenticatedShellProvider } from "./_components/authenticated-shell-provider";
import { DashboardSidebar } from "./_components/dashboard-sidebar";
import { DashboardTopbar } from "./_components/dashboard-topbar";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireSessionUser("/dashboard");

  if (!user) {
    redirect(LOGIN_ROUTE);
  }

  const roleLabel = user.roleKeys?.[0] ?? "Tenant User";
  const selfService = isSelfServiceUser(user.permissionKeys);

  const [
    featureAvailability,
    currentEmployeeContext,
    resolvedSettings,
    businessUnitAccess,
  ] =
    await Promise.all([
      apiRequestJson<TenantFeaturesResponse>(
        "/tenant-settings/features/availability",
      ).catch(() => null),
      getCurrentEmployee(user).catch(() => ({
        employee: null,
        isReportingManager: false,
      })),
      apiRequestJson<TenantResolvedSettingsResponse>(
        "/tenant-settings/resolved",
      ).catch(() => null),
      getBusinessUnitAccessSummary(),
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
  const brandingSettings = resolveBrandingSettings(resolvedSettings?.branding);
  const themeStyle = buildTenantThemeStyle(brandingSettings);
  const sessionTimeoutMinutes = Math.max(
    15,
    resolvedSettings?.system.autoLogoutMinutes ?? 15,
  );

  return (
    <AuthenticatedShellProvider
      inactivityTimeoutMinutes={sessionTimeoutMinutes}
      user={{
        avatarCacheKey,
        avatarSrc,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        permissionKeys: user.permissionKeys,
        profileHref: "/dashboard/profile",
        roleLabel,
        tenantId: user.tenantId,
        businessUnitAccess,
      }}
    >
      <div
        className="min-h-screen px-4 py-4 md:px-6 md:py-6"
        data-theme={
          resolvedSettings?.branding.defaultThemeMode?.toLowerCase() ||
          resolvedSettings?.system.defaultThemeMode?.toLowerCase() ||
          "light"
        }
        style={themeStyle}
      >
        <TenantFontSync fontFamily={brandingSettings.fontFamily} />
        <BrandingHeadEffects
          faviconUrl={brandingSettings.faviconUrl}
          title={brandingSettings.appTitle}
        />
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
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
          />

          <div className="flex min-w-0 flex-col gap-6">
            <DashboardTopbar
              avatarCacheKey={avatarCacheKey}
              avatarSrc={avatarSrc}
              email={user.email}
              firstName={user.firstName}
              lastName={user.lastName}
              profileHref="/dashboard/profile"
              roleLabel={roleLabel}
              tenantId={user.tenantId}
              tenantName={effectiveTenantName}
              tenantLogoUrl={
                resolvedSettings?.branding.squareLogoUrl ||
                resolvedSettings?.branding.logoUrl ||
                null
              }
            />
            {children}
          </div>
        </div>
      </div>
    </AuthenticatedShellProvider>
  );
}

function buildTenantThemeStyle(
  brandingTokens: BrandingSettings,
) {
  return buildBrandingCssVariables(brandingTokens) as CSSProperties;
}
