import type { ReactNode } from "react";
import { UserMenuDropdown } from "./user-menu-dropdown";
import { NotificationBell } from "./notification-bell";

type DashboardTopbarProps = {
  avatarCacheKey?: string | null;
  avatarSrc?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  profileHref: string;
  tenantId: string;
  tenantName?: string;
  roleLabel: string;
  canReadInbox?: boolean;
  pageTitle?: string;
  pageDescription?: string;
  /*
   * Passed straight through to the avatar menu. The topbar renders on every
   * authenticated screen, so it takes the workspace switcher as an already
   * rendered slot and never as data it has to fetch — see ITEM-0102.
   */
  workspaceSection?: ReactNode;
};

export function DashboardTopbar({
  avatarCacheKey,
  avatarSrc,
  firstName,
  lastName,
  email,
  profileHref,
  tenantName,
  roleLabel,
  canReadInbox = false,
  pageTitle = "Dashboard",
  pageDescription = "Manage your workspace from one place.",
  workspaceSection,
}: DashboardTopbarProps) {
  return (
    <header className="rounded-[24px] border border-border/70 bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5 lg:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
            {tenantName || roleLabel}
          </p>
          <h1 className="truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            {pageTitle}
          </h1>
          <p className="text-xs text-muted sm:text-xs">
            {pageDescription}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <NotificationBell canReadInbox={canReadInbox} />
          <UserMenuDropdown
            avatarCacheKey={avatarCacheKey}
            avatarSrc={avatarSrc}
            email={email}
            firstName={firstName}
            lastName={lastName}
            profileHref={profileHref}
            roleLabel={roleLabel}
            workspaceSection={workspaceSection}
          />
        </div>
      </div>
    </header>
  );
}
