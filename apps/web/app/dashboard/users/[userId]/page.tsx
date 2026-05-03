import { redirect } from "next/navigation";
import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { getSessionUser } from "@/lib/auth";
import { hasAnyPermission, hasPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import {
  formatDateTimeWithTenantSettings,
  formatDateWithTenantSettings,
} from "@/lib/date-format";
import { AccessDeniedState } from "@/app/dashboard/_components/access-denied-state";
import { Button } from "@/app/components/ui/button";
import { TenantResolvedSettingsResponse } from "../../settings/types";
import {
  UserAccessDetailCard,
  UserLinkedEmployeeCard,
  UserProfileHeader,
  UserSecurityDiagnosticsCard,
  UserTeamsCard,
} from "../_components/user-detail";
import { UserDetailProfile } from "../types";

type UserDetailPageProps = {
  params: Promise<{ userId: string }>;
  searchParams?: Promise<{ tab?: string }>;
};

type UserTabKey = "overview" | "access" | "employee" | "teams" | "security";

type UserTabConfig = {
  key: UserTabKey;
  label: string;
  requiredAnyPermissions?: readonly string[];
};

const userTabs: readonly UserTabConfig[] = [
  { key: "overview", label: "Overview" },
  {
    key: "access",
    label: "Access",
    requiredAnyPermissions: [
      PERMISSION_KEYS.USERS_READ,
      PERMISSION_KEYS.ROLES_READ,
    ],
  },
  { key: "employee", label: "Linked Employee" },
  { key: "teams", label: "Teams" },
  {
    key: "security",
    label: "Security Diagnostics",
    requiredAnyPermissions: [
      PERMISSION_KEYS.USERS_READ,
      PERMISSION_KEYS.ROLES_READ,
    ],
  },
];

export default async function UserDetailPage({
  params,
  searchParams,
}: UserDetailPageProps) {
  const { userId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const requestedTab = userTabs.some(
    (tab) => tab.key === resolvedSearchParams.tab,
  )
    ? (resolvedSearchParams.tab as UserTabKey)
    : "overview";

  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    redirect("/login?reason=session-expired");
  }

  const canReadUsers = hasPermission(
    sessionUser.permissionKeys,
    PERMISSION_KEYS.USERS_READ,
  );

  if (!canReadUsers) {
    return (
      <main className="dp-theme-scope grid gap-6">
        <AccessDeniedState
          title="You cannot view this user record."
          description="You do not have permission to read user records."
        />
      </main>
    );
  }

  const visibleTabs = userTabs.filter(
    (tab) =>
      !tab.requiredAnyPermissions ||
      hasAnyPermission(sessionUser.permissionKeys, tab.requiredAnyPermissions),
  );

  const activeTab = visibleTabs.some((tab) => tab.key === requestedTab)
    ? requestedTab
    : (visibleTabs[0]?.key ?? "overview");

  let user: UserDetailProfile;
  let resolvedSettings: TenantResolvedSettingsResponse | null = null;

  try {
    [user, resolvedSettings] = await Promise.all([
      apiRequestJson<UserDetailProfile>(`/users/${userId}`),
      apiRequestJson<TenantResolvedSettingsResponse>(
        "/tenant-settings/resolved",
      ).catch(() => null),
    ]);
  } catch (error: unknown) {
    if (isUnauthorizedApiError(error)) {
      redirect("/login?reason=session-expired");
    }

    if (
      error instanceof ApiRequestError &&
      (error.status === 403 || error.status === 404)
    ) {
      return (
        <main className="dp-theme-scope grid gap-6">
          <AccessDeniedState
            title="You cannot view this user record."
            description={`${error.status}: ${error.message}`}
          />
        </main>
      );
    }

    throw error;
  }

  const canUpdateUser = hasPermission(
    sessionUser.permissionKeys,
    PERMISSION_KEYS.USERS_UPDATE,
  );

  const canAssignRoles = hasPermission(
    sessionUser.permissionKeys,
    PERMISSION_KEYS.USERS_ASSIGN_ROLES,
  );

  const canDeleteUser = hasPermission(
    sessionUser.permissionKeys,
    PERMISSION_KEYS.USERS_DELETE,
  );

  const formattingOptions = {
    dateFormat: resolvedSettings?.system.dateFormat || "MM/dd/yyyy",
    locale: resolvedSettings?.system.locale || "en-US",
    timeFormat: resolvedSettings?.system.timeFormat || "12h",
    timezone:
      resolvedSettings?.organization.timezone ||
      resolvedSettings?.system.defaultTimezone ||
      "UTC",
  };

  const formatDateValue = (value?: string | null) =>
    formatDateWithTenantSettings(value, formattingOptions);

  const formatDateTimeValue = (value?: string | null) =>
    formatDateTimeWithTenantSettings(value, formattingOptions);

  return (
    <main className="dp-theme-scope grid gap-6">
      <UserProfileHeader
        canDeleteUser={canDeleteUser}
        canUpdateUser={canUpdateUser}
        formatDateTime={formatDateTimeValue}
        user={user}
      />

      <nav className="flex flex-wrap gap-2">
        {visibleTabs.map((tab) => {
          const isActive = tab.key === activeTab;

          return (
            <Button
              key={tab.key}
              href={`/dashboard/users/${user.id}?tab=${tab.key}`}
              size="sm"
              variant={isActive ? "primary" : "secondary"}
            >
              {tab.label}
            </Button>
          );
        })}
      </nav>

      {activeTab === "overview" ? (
        <section className="grid gap-6 xl:grid-cols-[0.65fr_0.35fr]">
          <UserAccessDetailCard
            canAssignRoles={canAssignRoles}
            canUpdateUser={canUpdateUser}
            formatDate={formatDateValue}
            formatDateTime={formatDateTimeValue}
            mode="summary"
            user={user}
          />

          <div className="grid gap-6">
            <UserLinkedEmployeeCard user={user} />
            <UserTeamsCard user={user} />
          </div>
        </section>
      ) : null}

      {activeTab === "access" ? (
        <UserAccessDetailCard
          canAssignRoles={canAssignRoles}
          canUpdateUser={canUpdateUser}
          formatDate={formatDateValue}
          formatDateTime={formatDateTimeValue}
          mode="full"
          user={user}
        />
      ) : null}

      {activeTab === "employee" ? <UserLinkedEmployeeCard user={user} /> : null}

      {activeTab === "teams" ? <UserTeamsCard user={user} /> : null}

      {activeTab === "security" ? (
        <UserSecurityDiagnosticsCard user={user} />
      ) : null}
    </main>
  );
}

function isUnauthorizedApiError(error: unknown) {
  if (error instanceof ApiRequestError) {
    return error.status === 401;
  }

  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as {
    status?: number;
    response?: {
      status?: number;
    };
  };

  return candidate.status === 401 || candidate.response?.status === 401;
}