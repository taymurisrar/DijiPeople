import { UserMenuDropdown } from "./user-menu-dropdown";
import { TenantLogo } from "@/app/components/branding/tenant-logo";

type DashboardTopbarProps = {
  avatarCacheKey?: string | null;
  avatarSrc?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  profileHref: string;
  tenantId: string;
  tenantName?: string;
  tenantLogoUrl?: string | null;
  roleLabel: string;
  pageTitle?: string;
  pageDescription?: string;
};

export function DashboardTopbar({
  avatarCacheKey,
  avatarSrc,
  firstName,
  lastName,
  email,
  profileHref,
  tenantName,
  tenantLogoUrl,
  roleLabel,
  pageTitle = "Dashboard",
  pageDescription = "Manage your workspace from one place.",
}: DashboardTopbarProps) {
  return (
    <header className="rounded-[24px] border border-border/70 bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5 lg:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <TenantLogo
              logoUrl={tenantLogoUrl}
              name={tenantName || roleLabel}
              sizeClassName="h-8 w-8"
            />
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
              {tenantName || roleLabel}
            </p>
          </div>
          <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {pageTitle}
          </h1>
          <p className="text-sm text-muted sm:text-base">
            {pageDescription}
          </p>
        </div>

        <UserMenuDropdown
          avatarCacheKey={avatarCacheKey}
          avatarSrc={avatarSrc}
          email={email}
          firstName={firstName}
          lastName={lastName}
          profileHref={profileHref}
          roleLabel={roleLabel}
        />
      </div>
    </header>
  );
}
