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
  tenantName?: string;
  roleLabel: string;
  canReadInbox?: boolean;
  pageTitle?: string;
  pageDescription?: string;

  /**
   * Identity-scoped workspace navigation rendered inside the user menu.
   *
   * The topbar deliberately receives this as an already-rendered slot rather
   * than loading workspace data itself. Workspace discovery is optional shell
   * functionality and must never delay the primary header.
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
  const contextLabel = tenantName?.trim() || roleLabel;

  return (
    <header
      className="
        rounded-[24px]
        border border-border/70
        bg-background
        px-4 py-4
        shadow-sm
        sm:px-5
        lg:px-6
      "
    >
      <div className="flex min-w-0 items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p
            className="
              truncate
              text-[11px] font-semibold uppercase
              tracking-[0.16em]
              text-muted
            "
            title={contextLabel}
          >
            {contextLabel}
          </p>

          <h1
            className="
              mt-1 truncate
              text-lg font-semibold
              tracking-tight
              text-foreground
              sm:text-xl
            "
            title={pageTitle}
          >
            {pageTitle}
          </h1>

          {pageDescription ? (
            <p className="mt-0.5 truncate text-xs leading-5 text-muted">
              {pageDescription}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
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