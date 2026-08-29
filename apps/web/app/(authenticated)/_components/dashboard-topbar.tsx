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

  return (
    <header className="rounded-[24px] border border-border/70 bg-white px-4 py-4 shadow-sm sm:px-5 sm:py-5 lg:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
            {tenantName || roleLabel}
          </p>
          <h1 className="truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            {resolvedTitle}
          </h1>
          {resolvedDescription ? (
            <p className="text-xs text-muted sm:text-xs">{resolvedDescription}</p>
          ) : null}
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
