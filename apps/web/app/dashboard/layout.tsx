import { redirect } from "next/navigation";
import { CSSProperties } from "react";
import { requireSessionUser } from "@/lib/auth";
import { LOGIN_ROUTE } from "@/lib/auth-config";
import { apiRequestJson } from "@/lib/server-api";
import { FaviconSync } from "@/app/components/branding/favicon-sync";
import { isSelfServiceUser } from "@/lib/permissions";
import {
  TenantFeaturesResponse,
  TenantResolvedSettingsResponse,
} from "./settings/types";
import { getCurrentEmployee } from "./_lib/current-employee";
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

  const [featureAvailability, currentEmployeeContext, resolvedSettings] =
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
  const themeStyle = buildTenantThemeStyle(resolvedSettings);
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
        <FaviconSync faviconUrl={resolvedSettings?.branding.faviconUrl ?? null} />
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <DashboardSidebar
            enabledFeatureKeys={featureAvailability?.enabledKeys ?? null}
            isReportingManager={isReportingManager}
            isSelfService={selfService}
            permissionKeys={user.permissionKeys}
            roleKeys={user.roleKeys}
            tenantId={user.tenantId}
            tenantName={effectiveTenantName}
            brandLogoUrl={resolvedSettings?.branding.logoUrl ?? null}
            brandName={resolvedSettings?.branding.brandName ?? null}
            brandTagline={resolvedSettings?.branding.portalTagline ?? null}
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
  resolvedSettings: TenantResolvedSettingsResponse | null,
) {
  if (!resolvedSettings?.branding) {
    return undefined;
  }

  const accent =
    resolvedSettings.branding.accentColor ||
    resolvedSettings.branding.primaryColor ||
    "#0f766e";
  const appBackgroundColor =
    resolvedSettings.branding.appBackgroundColor || "#f5f0e8";
  const appSurfaceColor = resolvedSettings.branding.appSurfaceColor || "#fffaf4";
  const pageGradientStart =
    resolvedSettings.branding.pageGradientStartColor || "#fffcf7";
  const pageGradientEnd =
    resolvedSettings.branding.pageGradientEndColor || "#f5f0e8";
  const cardGradientStart =
    resolvedSettings.branding.cardGradientStartColor || "#ffffff";
  const cardGradientEnd =
    resolvedSettings.branding.cardGradientEndColor || "#d6f4ee";
  const accentStrong = darkenHex(accent, 18);
  const accentSoft = lightenHex(accent, 82);

  return {
    "--accent": accent,
    "--accent-strong": accentStrong,
    "--accent-soft": accentSoft,
    "--background": appBackgroundColor,
    "--surface": appSurfaceColor,
    "--surface-strong": appSurfaceColor,
    "--dp-page-gradient-start": pageGradientStart,
    "--dp-page-gradient-end": pageGradientEnd,
    "--dp-card-gradient-start": cardGradientStart,
    "--dp-card-gradient-end": cardGradientEnd,
  } as CSSProperties;
}

function darkenHex(hex: string, percent: number) {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#115e59";
  return rgbToHex({
    r: Math.max(0, Math.round(rgb.r * (1 - percent / 100))),
    g: Math.max(0, Math.round(rgb.g * (1 - percent / 100))),
    b: Math.max(0, Math.round(rgb.b * (1 - percent / 100))),
  });
}

function lightenHex(hex: string, percent: number) {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#d7f3ef";
  const factor = percent / 100;
  return rgbToHex({
    r: Math.min(255, Math.round(rgb.r + (255 - rgb.r) * factor)),
    g: Math.min(255, Math.round(rgb.g + (255 - rgb.g) * factor)),
    b: Math.min(255, Math.round(rgb.b + (255 - rgb.b) * factor)),
  });
}

function hexToRgb(hex: string) {
  const normalized = hex.trim().replace("#", "");
  const isShort = normalized.length === 3;
  const expanded = isShort
    ? normalized
        .split("")
        .map((entry) => `${entry}${entry}`)
        .join("")
    : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    return null;
  }

  const numeric = Number.parseInt(expanded, 16);
  return {
    r: (numeric >> 16) & 255,
    g: (numeric >> 8) & 255,
    b: numeric & 255,
  };
}

function rgbToHex({
  r,
  g,
  b,
}: {
  r: number;
  g: number;
  b: number;
}) {
  return `#${[r, g, b]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}
