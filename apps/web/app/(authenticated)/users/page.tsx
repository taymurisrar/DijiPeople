import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { hasPermission, isSelfServiceUser } from "@/lib/permissions";
import { apiRequestJson } from "@/lib/server-api";
import { UserListItem, UserListResponse } from "./types";
import { ModuleViewSelector } from "@/app/components/runtime/module-view-selector";

import {
    getTableViews,
    resolveFiltersAndSorting,
    resolveVisibleColumns,
    withFallbackViews,
} from "@/lib/customization-views";

import { AccessDeniedState } from "../_components/access-denied-state";
import {
    getBusinessUnitAccessSummary,
    hasBusinessUnitScope,
} from "../_lib/business-unit-access";

import { UsersTable } from "./_components/users-table";
import { UsersCommandBar } from "./_components/users-command-bar";
import { UsersFilterBar } from "./_components/users-filter-bar";
import { TenantResolvedSettingsResponse } from "../settings/types";

type UsersPageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UsersPage({ searchParams }: UsersPageProps) {
    const businessUnitAccess = await getBusinessUnitAccessSummary();

    if (!hasBusinessUnitScope(businessUnitAccess)) {
        return (
            <div className="grid gap-6">
                <AccessDeniedState
                    title="Users are unavailable for your current business unit access."
                    description="Your scope does not allow access to user records."
                />
            </div>
        );
    }

    const user = await getSessionUser();

    const canCreate = hasPermission(user?.permissionKeys, "users.create");
    const canDelete = hasPermission(user?.permissionKeys, "users.delete");
    const canAssignRoles = hasPermission(
        user?.permissionKeys,
        "users.assignRoles",
    );
    const canImport = hasPermission(user?.permissionKeys, "users.import");
    const canExport = hasPermission(user?.permissionKeys, "users.export");

    if (user && isSelfServiceUser(user.permissionKeys)) {
        redirect("/my-profile");
    }

    const params = await searchParams;

    const search = getSearchParam(params.search);
    const status = getSearchParam(params.status);
    const businessUnitId = getSearchParam(params.businessUnitId);
    const selectedViewKey = getSearchParam(params.view);
    const page = getPositiveNumberParam(params.page, 1);
    const pageSize = getPositiveNumberParam(params.pageSize, 10);
    const orderBy = getSearchParam(params.orderBy);

    const query = new URLSearchParams();

    if (search) query.set("search", search);
    if (status) query.set("status", status);
    if (businessUnitId) query.set("businessUnitId", businessUnitId);

    query.set("page", String(page));
    query.set("pageSize", String(pageSize));

    // Always the REST list endpoint. This used to branch on USE_ENTITY_DATA_API
    // and ask the generic entity-data API for an entity called "users", but
    // `entity-registry.ts` registers only `employees`, so the request 404'd with
    // "Entity is not available: users" and the throw escaped this Server
    // Component — the page has never rendered for any tenant with the flag on.
    // The branch was lossy as well as broken: it hardcoded `userRoles: []`,
    // `employee: null` and `businessUnit: null`, which are three of the columns
    // this screen exists to show. Re-introduce it only after `users` is a
    // registered entity that projects those relations.
    const [rawUsers, resolvedSettings, publishedViews] = await Promise.all([
        apiRequestJson<UserListResponse>(`/users?${query.toString()}`),
        apiRequestJson<TenantResolvedSettingsResponse>(
            "/tenant-settings/resolved",
        ).catch(() => null),
        getTableViews("users"),
    ]);

    const users = normalizeUserListResponse(rawUsers, page, pageSize);

    const userViews = withFallbackViews("users", publishedViews, [
        {
            id: "allUsers",
            viewKey: "allUsers",
            tableKey: "users",
            name: "All Users",
            type: "system",
            isDefault: true,
            columnsJson: {
                columns: [
                    { columnKey: "firstName" },
                    { columnKey: "lastName" },
                    { columnKey: "email" },
                    { columnKey: "status" },
                    { columnKey: "businessUnitId" },
                    { columnKey: "lastLoginAt" },
                ],
            },
            sortingJson: [{ columnKey: "firstName", direction: "asc" }],
        },
    ]);

    const selectedView =
        userViews.find((v) => v.viewKey === selectedViewKey) ??
        userViews.find((v) => v.isDefault) ??
        userViews[0];

    const visibleColumnKeys = resolveVisibleColumns("users", selectedView, [
        "firstName",
        "lastName",
        "email",
        "status",
        "businessUnitId",
        "lastLoginAt",
    ]);

    const viewState = resolveFiltersAndSorting("users", selectedView);
    const initialSort = resolveUserSort(viewState.sorting);

    const formatting = {
        dateFormat: resolvedSettings?.system.dateFormat || "MM/dd/yyyy",
        locale: resolvedSettings?.system.locale || "en-US",
        timezone:
            resolvedSettings?.organization.timezone ||
            resolvedSettings?.system.defaultTimezone ||
            "UTC",
    };

    return (
        <div className="grid gap-6">
            <ModuleViewSelector
                configureHref="/settings/customization/tables/users"
                enabled
                selectedViewId={selectedView?.viewKey ?? ""}
                views={userViews}
            />

            <UsersCommandBar
                canCreate={canCreate}
                canDelete={canDelete}
                canAssignRoles={canAssignRoles}
                canImport={canImport}
                canExport={canExport}
            />

            {users.items.length === 0 ? (
                <section className="rounded-2xl border border-dashed p-10 text-center">
                    <h4 className="text-xl font-semibold">No users found</h4>
                    <p className="mt-2 text-muted">
                        Create your first user or adjust filters.
                    </p>

                    {canCreate && (
                        <Link
                            href="/users/new"
                            className="mt-4 inline-block rounded-xl bg-accent px-5 py-3 text-white"
                        >
                            Create User
                        </Link>
                    )}
                </section>
            ) : (
                <UsersTable
                    users={users.items}
                    formatting={formatting}
                    initialSortColumnKey={initialSort.columnKey}
                    initialSortDirection={initialSort.direction}
                    pagination={{
                        page: users.meta?.page ?? page,
                        pageSize: users.meta?.pageSize ?? pageSize,
                        totalItems: users.meta?.total ?? users.items.length,
                        pathname: "/users",
                        searchParams: { search, status, businessUnitId, orderBy },
                    }}
                    visibleColumnKeys={visibleColumnKeys}
                />
            )}
        </div>
    );
}

function resolveUserSort(sorting: unknown): {
    columnKey: string;
    direction: "asc" | "desc";
} {
    const firstSort = Array.isArray(sorting) ? sorting[0] : null;

    const columnKey =
        firstSort && typeof firstSort === "object"
            ? (firstSort as { columnKey?: unknown }).columnKey
            : null;

    const direction =
        firstSort && typeof firstSort === "object"
            ? (firstSort as { direction?: unknown }).direction
            : null;

    const map: Record<string, string> = {
        firstName: "user",
        lastName: "user",
        email: "email",
        status: "status",
        businessUnitId: "businessUnit",
        lastLoginAt: "lastLoginAt",
        createdAt: "createdAt",
    };

    return {
        columnKey:
            typeof columnKey === "string" ? map[columnKey] ?? "user" : "user",
        direction: direction === "desc" ? "desc" : "asc",
    };
}

function getSearchParam(value?: string | string[]) {
    return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getPositiveNumberParam(
    value: string | string[] | undefined,
    fallback: number,
) {
    const v = Array.isArray(value) ? value[0] : value;
    const parsed = Number(v);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeUserListResponse(
  response: UserListResponse | UserListItem[] | unknown,
  page: number,
  pageSize: number,
): UserListResponse {
  if (isUserListResponse(response)) {
    return response;
  }

  if (Array.isArray(response)) {
    return buildUserListResponse(response, page, pageSize);
  }

  if (isObjectRecord(response) && Array.isArray(response.users)) {
    const items = response.users as UserListItem[];

    return buildUserListResponse(
      items,
      page,
      pageSize,
      typeof response.total === "number" ? response.total : items.length,
      typeof response.totalPages === "number"
        ? response.totalPages
        : Math.max(1, Math.ceil(items.length / pageSize)),
    );
  }

  return buildUserListResponse([], page, pageSize, 0, 1);
}

function isUserListResponse(value: unknown): value is UserListResponse {
  return (
    isObjectRecord(value) &&
    Array.isArray(value.items)
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function buildUserListResponse(
  items: UserListItem[],
  page: number,
  pageSize: number,
  total = items.length,
  totalPages = Math.max(1, Math.ceil(total / pageSize)),
): UserListResponse {
  return {
    items,
    meta: {
      page,
      pageSize,
      total,
      totalPages,
    },
    filters: {
      search: null,
      status: null,
      businessUnitId: null,
    },
  };
}
