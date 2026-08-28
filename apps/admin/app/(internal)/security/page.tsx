import type { Metadata } from "next";
import {
  AdminKeyValueGrid,
  AdminPageHeader,
  AdminSectionCard,
  AdminWorkspace,
} from "@/app/_components/admin-ui";
import { ChangePasswordForm } from "@/app/_components/security/change-password-form";
import { requireSystemAdminUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";
import { formatPlatformRole, type PlatformRole } from "@/lib/platform-rbac";
import { formatDateTime } from "@/lib/formatters";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Security",
};


type SecurityOverview = {
  account: {
    id: string;
    email: string;
    name: string;
    role: PlatformRole;
    status: string;
    lastActiveAt: string | null;
    createdAt: string;
  };
  access: {
    role: PlatformRole;
    guardAliases: string[];
    permissionKeys: string[];
    permissionCount: number;
  };
  sessions: {
    activeCount: number;
    items: Array<{
      id: string;
      sessionId: string | null;
      appClientId: string;
      isCurrent: boolean;
      createdAt: string;
      lastUsedAt: string | null;
      expiresAt: string;
      userAgent: string | null;
      ipAddress: string | null;
    }>;
  };
};

export const dynamic = "force-dynamic";

/**
 * The signed-in platform user's own security page.
 *
 * It previously showed four read-only values and a notice saying password and
 * session management were unavailable — which was true, because no API existed.
 * The API exists now, so the page does the thing instead of explaining why it
 * cannot.
 *
 * Everything here is scoped to the actor by the API, which takes no user id.
 */
export default async function SecurityPage() {
  const user = await requireSystemAdminUser("/security");

  const overview = await apiRequestJson<SecurityOverview>(
    "/platform-users/me/security",
  ).catch(() => null);

  const role = overview?.access.role ?? user.role;
  const permissionKeys =
    overview?.access.permissionKeys ?? user.permissionKeys ?? [];

  return (
    <AdminWorkspace>
      <AdminPageHeader
        eyebrow="Security"
        title="Security"
        description="Your platform account, what it can reach, and the sessions signed in as you."
      />

      <AdminSectionCard
        title="Account"
        description="Identity as the platform knows it."
      >
        <AdminKeyValueGrid
          items={[
            { label: "Name", value: overview?.account.name ?? "—" },
            { label: "Email", value: user.email },
            {
              /*
               * One role, rendered once. This used to print the raw guard alias
               * list — "PLATFORM_OWNER, platform-owner, SUPER_ADMIN,
               * system-admin" — which reads as four roles for one person.
               */
              label: "Platform role",
              value: role ? formatPlatformRole(role) : "—",
            },
            { label: "Account status", value: overview?.account.status ?? "—" },
            {
              label: "Signed in as",
              value: user.tenantName,
            },
            {
              label: "Last activity",
              value: overview?.account.lastActiveAt
                ? formatDateTime(overview.account.lastActiveAt)
                : "Not recorded",
            },
          ]}
        />
      </AdminSectionCard>

      <AdminSectionCard
        title="Change password"
        description="Applies immediately. Your current password is required and is verified by the API."
      >
        <ChangePasswordForm />
      </AdminSectionCard>

      <AdminSectionCard
        title="Active sessions"
        description={
          overview
            ? `${overview.sessions.activeCount} live session${
                overview.sessions.activeCount === 1 ? "" : "s"
              } for this account. Changing your password ends the others.`
            : "Session details are unavailable."
        }
      >
        {overview?.sessions.items.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Client</th>
                  <th className="py-2 pr-3">Last used</th>
                  <th className="py-2 pr-3">Expires</th>
                  <th className="py-2">Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overview.sessions.items.map((session) => (
                  <tr key={session.id} className="text-slate-700">
                    <td className="py-2.5 pr-3">
                      <span className="font-medium text-slate-900">
                        {session.appClientId}
                      </span>
                      {session.isCurrent ? (
                        <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-900">
                          This session
                        </span>
                      ) : null}
                      {session.userAgent ? (
                        <span className="mt-0.5 block max-w-[280px] truncate text-xs text-slate-500">
                          {session.userAgent}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3 text-xs">
                      {session.lastUsedAt
                        ? formatDateTime(session.lastUsedAt)
                        : formatDateTime(session.createdAt)}
                    </td>
                    <td className="py-2.5 pr-3 text-xs">
                      {formatDateTime(session.expiresAt)}
                    </td>
                    <td className="py-2.5 font-mono text-xs">
                      {session.ipAddress ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            No other live sessions are recorded for this account.
          </p>
        )}
      </AdminSectionCard>

      <AdminSectionCard
        title="Access"
        description="What this role can reach. Platform permissions are granted by role and are not editable per user."
      >
        <AdminKeyValueGrid
          items={[
            {
              label: "Permissions granted",
              value: `${permissionKeys.length}`,
            },
            {
              label: "Guard aliases",
              value: overview?.access.guardAliases.length
                ? `${overview.access.guardAliases.length}`
                : "—",
              /* Named, but not presented as roles — see below. */
            },
          ]}
        />

        {permissionKeys.length ? (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Permissions
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[...permissionKeys].sort().map((permission) => (
                <span
                  key={permission}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-700"
                >
                  {permission}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {overview?.access.guardAliases.length ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Guard aliases for this role
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Internal names the authorization guards accept for{" "}
              {role ? formatPlatformRole(role) : "this role"}. They are one role
              under several naming conventions, not several roles.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {overview.access.guardAliases.map((alias) => (
                <span
                  key={alias}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] text-slate-600"
                >
                  {alias}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </AdminSectionCard>
    </AdminWorkspace>
  );
}
