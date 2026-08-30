"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { resolveRouteTitle } from "@/lib/tenant-branding-client";
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
  pageTitle,
  pageDescription,
  workspaceSection,
}: DashboardTopbarProps) {
  /*
   * BUG-1950 - this used to default to the constant "Dashboard", and the
   * layout never passed anything else, so the only `h1` on all 232
   * authenticated routes announced every screen as the same page. Anyone
   * navigating by headings heard "Dashboard" on employees, leave, payroll and
   * every settings category alike.
   *
   * Derived from the path rather than declared per route for two reasons: 232
   * routes cannot each be relied on to remember, and `resolveRouteTitle` is
   * already what names the browser tab - so the heading and the document title
   * now cannot disagree. A route with a better name of its own still passes
   * `pageTitle` and wins.
   *
   * Client-side because a shared layout is not re-rendered on client
   * navigation: computing this on the server would have left the heading
   * showing whichever screen was loaded first.
   */
  const pathname = usePathname();
  const resolvedTitle = pageTitle?.trim() || resolveRouteTitle(pathname) || "Workspace";
  /*
   * The generic line belongs to the overview it was written for. Under
   * "Employees" it said nothing, so it is not rendered there.
   */
  const resolvedDescription =
    pageDescription ??
    (pathname === "/" ? "Manage your workspace from one place." : null);
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
          {/*
            The top-menu restyle on develop and BUG-1950's per-page heading
            landed on the same element. The styling is develop's; the values are
            BUG-1950's. Rendering `pageTitle` here with the new styling would
            have looked like a clean merge and quietly restored the defect —
            every one of the 232 authenticated routes announcing itself as
            "Dashboard" — while BUG-1950's record still read FIXED.
          */}
          <h1
            className="
              mt-1 truncate
              text-lg font-semibold
              tracking-tight
              text-foreground
              sm:text-xl
            "
            title={resolvedTitle}
          >
            {resolvedTitle}
          </h1>

          {resolvedDescription ? (
            <p className="mt-0.5 truncate text-xs leading-5 text-muted">
              {resolvedDescription}
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