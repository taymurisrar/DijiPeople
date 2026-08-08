import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { hasElevatedTenantRole } from "@/lib/elevated-roles";
import { isSelfServiceUser } from "@/lib/permissions";
import { apiRequestJson } from "@/lib/server-api";
import { ROLE_KEYS } from "@/lib/security-keys";
import { buildEntityDataUrl } from "@/app/components/entity-data/entity-query-builder";
import {
  EntityDataResponse,
  EntityFilter,
} from "@/app/components/entity-data/entity-query-types";
import { getTableViews, withFallbackViews } from "@/lib/customization-views";
import { AccessDeniedState } from "../_components/access-denied-state";
import {
  getBusinessUnitAccessSummary,
  hasBusinessUnitScope,
} from "../_lib/business-unit-access";
import { getCurrentEmployee } from "../_lib/current-employee";
import { EmployeeEntityRecord, EmployeeListResponse } from "./types";
import { TenantResolvedSettingsResponse } from "../settings/types";
import { DataTableFilterState } from "@/app/components/data-table/types";
import {
  buildEmployeeRuntimeContext,
  resolveEmployeeRuntimeView,
  resolveTenantRuntimeConfig,
} from "@/lib/runtime";

type EmployeesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EmployeesPage({
  searchParams,
}: EmployeesPageProps) {
  const [user, currentEmployeeContext, businessUnitAccess] = await Promise.all([
    getSessionUser(),
    getCurrentEmployee(),
    getBusinessUnitAccessSummary(),
  ]);
  const hasOrganizationEmployeeRole =
    hasElevatedTenantRole(user?.roleKeys) ||
    (user?.roleKeys ?? []).some(
      (roleKey) => roleKey === ROLE_KEYS.CEO || roleKey === ROLE_KEYS.HR,
    );

  if (
    !hasOrganizationEmployeeRole &&
    !hasBusinessUnitScope(businessUnitAccess)
  ) {
    return (
      <main className="dp-theme-scope dp-employees-scope grid gap-6">
        <AccessDeniedState
          description="Your current business-unit scope does not include employee records."
          title="Employees are unavailable for your current business unit access."
        />
      </main>
    );
  }

  if (
    user &&
    isSelfServiceUser(user.permissionKeys) &&
    !currentEmployeeContext.isReportingManager
  ) {
    redirect("/my-profile");
  }

  const params = await searchParams;
  const search = getSearchParam(params.search);
  const employmentStatus = getSearchParam(params.employmentStatus);
  const reportingManagerEmployeeId = getSearchParam(
    params.reportingManagerEmployeeId,
  );
  const selectedViewId = getSearchParam(params.viewId);
  const page = getPositiveNumberParam(params.page, 1);
  const pageSize = getPositiveNumberParam(params.pageSize, 10);
  const orderBy = getSearchParam(params.orderBy);
  const columnFilters = resolveEmployeeColumnFilters(params);
  const useEntityDataApi = process.env.USE_ENTITY_DATA_API === "true";

  const query = new URLSearchParams();

  if (search) {
    query.set("search", search);
  }

  if (employmentStatus) {
    query.set("employmentStatus", employmentStatus);
  }

  if (reportingManagerEmployeeId) {
    query.set("reportingManagerEmployeeId", reportingManagerEmployeeId);
  }

  for (const filter of columnFilters.queryParams) {
    query.set(filter.key, filter.value);
  }

  if (orderBy) {
    query.set("orderBy", orderBy);
  }

  query.set("page", String(page));
  query.set("pageSize", String(pageSize));

  const [employees, resolvedSettings, publishedViews] = await Promise.all([
    useEntityDataApi
      ? fetchEmployeesFromEntityData({
          search,
          employmentStatus,
          reportingManagerEmployeeId,
          orderBy,
          columnFilters: columnFilters.tableFilters,
          page,
          pageSize,
        })
      : apiRequestJson<EmployeeListResponse>(`/employees?${query.toString()}`),
    apiRequestJson<TenantResolvedSettingsResponse>(
      "/tenant-settings/resolved",
    ).catch(() => null),
    getTableViews("employees"),
  ]);

  /*
   * No local fallback list here. The employee metadata adapter already supplies
   * the system views, and defining a second "All Employees" under a different
   * view key made it appear twice in the view selector.
   */
  const employeeViews = withFallbackViews("employees", publishedViews, []);

  const formatting = {
    dateFormat: resolvedSettings?.system.dateFormat || "MM/dd/yyyy",
    locale: resolvedSettings?.system.locale || "en-US",
    timezone:
      resolvedSettings?.organization.timezone ||
      resolvedSettings?.system.defaultTimezone ||
      "UTC",
  };

  const employeeRuntimeContext = buildEmployeeRuntimeContext({
    tenant: resolveTenantRuntimeConfig({
      tenantId: employees.items[0]?.tenantId,
      tenantSlug: "current",
      displayName: resolvedSettings?.organization.companyDisplayName,
      locale: resolvedSettings?.system.locale,
      timezone:
        resolvedSettings?.organization.timezone ||
        resolvedSettings?.system.defaultTimezone,
      dateFormat: resolvedSettings?.system.dateFormat,
      timeFormat: resolvedSettings?.system.timeFormat,
      currencyCode:
        resolvedSettings?.organization.currency ||
        resolvedSettings?.system.defaultCurrency,
      branding: {
        appTitle: resolvedSettings?.branding.appTitle ?? "DijiPeople",
        brandName: resolvedSettings?.branding.brandName ?? "DijiPeople",
        logoUrl: resolvedSettings?.branding.logoUrl,
        faviconUrl: resolvedSettings?.branding.faviconUrl,
        primaryColor: resolvedSettings?.branding.primaryColor ?? "#2563eb",
        secondaryColor: resolvedSettings?.branding.secondaryColor,
        bodyFontFamilyKey: resolvedSettings?.branding.fontFamily,
        headingFontFamilyKey: resolvedSettings?.branding.fontFamily,
        density:
          resolvedSettings?.system.uiDensity === "COMPACT"
            ? "compact"
            : resolvedSettings?.system.uiDensity === "SPACIOUS"
              ? "spacious"
              : "comfortable",
      },
    }),
    principal: {
      userId: user?.userId ?? "",
      tenantId: employees.items[0]?.tenantId ?? "current",
      displayName: user
        ? [user.firstName, user.lastName].filter(Boolean).join(" ")
        : null,
      name: user
        ? [user.firstName, user.lastName].filter(Boolean).join(" ")
        : null,
      email: user?.email,
      roleKeys: user?.roleKeys ?? [],
      roles: user?.roles ?? [],
      permissionKeys: user?.permissionKeys ?? [],
    },
    forms: [],
    views: employeeViews,
  });

  const activeRuntimeView = resolveEmployeeRuntimeView(
    employeeRuntimeContext.metadata.views,
    selectedViewId,
  );

  const { EmployeeRuntimeListWrapper } =
    await import("./_components/employee-runtime-list-wrapper");

  return (
    <main className="dp-theme-scope dp-employees-scope grid gap-3">
      <EmployeeRuntimeListWrapper
        activeView={activeRuntimeView}
        employees={employees.items}
        formatting={formatting}
        initialFilters={columnFilters.tableFilters}
        pagination={{
          page: employees.meta?.page ?? page,
          pageSize: employees.meta?.pageSize ?? pageSize,
          totalItems: employees.meta?.total ?? employees.items.length,
          pathname: "/employees",
          searchParams: {
            search,
            employmentStatus,
            reportingManagerEmployeeId,
            orderBy,
            viewId: activeRuntimeView?.viewId ?? activeRuntimeView?.id,
            ...columnFilters.searchParams,
          },
        }}
        runtime={employeeRuntimeContext}
      />
    </main>
  );
}

async function fetchEmployeesFromEntityData(input: {
  search: string;
  employmentStatus: string;
  reportingManagerEmployeeId: string;
  orderBy: string;
  columnFilters: DataTableFilterState[];
  page: number;
  pageSize: number;
}): Promise<EmployeeListResponse> {
  const url = buildEntityDataUrl({
    entityLogicalName: "employees",
    select: [
      "id",
      "firstName",
      "lastName",
      "email",
      "phone",
      "employeeCode",
      "employmentStatus",
      "hireDate",
      "managerEmployeeId",
    ],
    filter: [
      ...(input.employmentStatus
        ? [
            {
              field: "employmentStatus",
              operator: "eq" as const,
              value: input.employmentStatus,
            },
          ]
        : []),
      ...(input.reportingManagerEmployeeId
        ? [
            {
              field: "managerEmployeeId",
              operator: "eq" as const,
              value: input.reportingManagerEmployeeId,
            },
          ]
        : []),
      ...mapEmployeeEntityFilters(input.columnFilters),
    ],
    orderBy: resolveEntityOrderBy(input.orderBy),
    expand: [
      {
        relation: "manager",
        select: ["id", "firstName", "lastName", "employeeCode", "email"],
      },
    ],
    search: input.search,
    page: input.page,
    pageSize: input.pageSize,
  }).replace(/^\/api/, "");

  const response =
    await apiRequestJson<EntityDataResponse<EmployeeEntityRecord>>(url);

  return {
    items: response.items.map(mapEntityEmployee),
    meta: {
      page: response.meta.page,
      pageSize: response.meta.pageSize,
      total: response.meta.total,
      totalPages: response.meta.totalPages,
    },
    filters: {
      search: input.search || null,
      employmentStatus:
        (input.employmentStatus as EmployeeListResponse["filters"]["employmentStatus"]) ||
        null,
      reportingManagerEmployeeId: input.reportingManagerEmployeeId || null,
    },
  };
}

function resolveEntityOrderBy(orderBy: string) {
  const match = orderBy.match(/^([A-Za-z][A-Za-z0-9_]*)\s+(asc|desc)$/);

  if (match) {
    return [{ field: match[1], direction: match[2] as "asc" | "desc" }];
  }

  return [{ field: "firstName", direction: "asc" as const }];
}

function mapEntityEmployee(employee: EmployeeEntityRecord) {
  const fullName = [employee.firstName, employee.lastName]
    .filter(Boolean)
    .join(" ");

  const manager = employee.manager
    ? {
        ...employee.manager,
        preferredName: null,
        fullName: [employee.manager.firstName, employee.manager.lastName]
          .filter(Boolean)
          .join(" "),
        employmentStatus: "ACTIVE" as const,
      }
    : null;

  return {
    id: employee.id,
    tenantId: "",
    employeeCode: employee.employeeCode,
    firstName: employee.firstName,
    middleName: null,
    lastName: employee.lastName,
    preferredName: null,
    fullName,
    profileImageDocumentId: null,
    workEmail: employee.email ?? null,
    personalEmail: null,
    phone: employee.phone ?? "",
    alternatePhone: null,
    employmentStatus: employee.employmentStatus,
    hireDate: employee.hireDate ?? "",
    managerEmployeeId: employee.managerEmployeeId ?? null,
    reportingManagerEmployeeId: employee.managerEmployeeId ?? null,
    manager,
    reportingManager: manager,
    user: null,
    ownerUserId: null,
    ownerUser: null,
    department: null,
    designation: null,
    location: null,
    officialJoiningLocation: null,
    profileImage: null,
    createdAt: "",
    updatedAt: "",
    counts: {
      directReports: 0,
      educationRecords: 0,
      historyRecords: 0,
      documents: 0,
    },
  } as EmployeeListResponse["items"][number];
}

function getSearchParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function getPositiveNumberParam(
  value: string | string[] | undefined,
  fallback: number,
) {
  const resolved = Array.isArray(value) ? value[0] : value;
  const parsed = Number(resolved);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
}

function mapEmployeeEntityFilters(
  filters: DataTableFilterState[],
): EntityFilter[] {
  const entityFilters: EntityFilter[] = [];

  for (const filter of filters) {
    if (!filter.value) continue;

    if (filter.columnKey === "code") {
      entityFilters.push({
        field: "employeeCode",
        operator: "contains",
        value: filter.value,
      });
      continue;
    }

    if (filter.columnKey === "status") {
      const values = filter.value.split(",").filter(Boolean);

      entityFilters.push(
        values.length > 1
          ? {
              field: "employmentStatus",
              operator: "in",
              value: values,
            }
          : {
              field: "employmentStatus",
              operator: "eq",
              value: values[0] ?? filter.value,
            },
      );
      continue;
    }

    if (filter.columnKey === "hireDate") {
      const operatorMap: Record<string, EntityFilter["operator"]> = {
        before: "lt",
        after: "gt",
        equals: "eq",
      };

      entityFilters.push({
        field: "hireDate",
        operator: operatorMap[filter.operator] ?? "eq",
        value: filter.value,
      });
      continue;
    }

    if (filter.columnKey === "contact") {
      entityFilters.push({
        field: "email",
        operator: "contains",
        value: filter.value,
      });
    }
  }

  return entityFilters;
}

function resolveEmployeeColumnFilters(
  params: Record<string, string | string[] | undefined>,
) {
  /*
   * The table derives its filter parameter from the column's entity field,
   * which is not always the name the employees endpoint accepts. Each spec
   * therefore lists the aliases a column can arrive under, and only ever emits
   * the endpoint's own parameter name. Forwarding the raw table parameter made
   * the request fail validation, which dropped the whole list rather than just
   * the filter.
   */
  const specs = [
    {
      columnKey: "employee",
      paramKey: "name",
      aliases: ["fullName", "firstName", "employee"],
      defaultOperator: "contains",
    },
    {
      columnKey: "code",
      paramKey: "code",
      aliases: ["employeeCode"],
      defaultOperator: "contains",
    },
    {
      columnKey: "status",
      paramKey: "status",
      aliases: ["employmentStatus"],
      defaultOperator: "equals",
    },
    {
      columnKey: "reportingManager",
      paramKey: "reportingManager",
      aliases: ["reportingManagerEmployeeId", "manager"],
      defaultOperator: "contains",
    },
    {
      columnKey: "hireDate",
      paramKey: "hireDate",
      aliases: [],
      defaultOperator: "equals",
    },
    {
      columnKey: "contact",
      paramKey: "contact",
      aliases: ["email", "workEmail", "phone"],
      defaultOperator: "contains",
    },
  ];
  const tableFilters: DataTableFilterState[] = [];
  const queryParams: Array<{ key: string; value: string }> = [];
  const searchParams: Record<string, string> = {};

  for (const spec of specs) {
    const names = [spec.paramKey, ...spec.aliases];
    // Matched on either part: "Is empty" and "Has data" send an operator with
    // no value, so keying off the value alone dropped them entirely.
    const nameInUse =
      names.find(
        (name) =>
          getSearchParam(params[`${name}Filter`]) ||
          getSearchParam(params[`${name}FilterOperator`]),
      ) ?? spec.paramKey;

    const value = getSearchParam(params[`${nameInUse}Filter`]);
    const operator =
      getSearchParam(params[`${nameInUse}FilterOperator`]) ||
      spec.defaultOperator;
    const valueTo = getSearchParam(params[`${nameInUse}FilterTo`]);

    // "Is empty" and "Has data" compare nothing, so requiring a value here
    // would silently drop them and the condition would appear to do nothing.
    const comparesNothing =
      operator === "isEmpty" || operator === "isNotEmpty";

    if (!value && !comparesNothing) continue;

    tableFilters.push({
      /*
       * The table matches an active filter by its own column key, which is the
       * entity field it wrote to the URL. Using the endpoint's parameter name
       * here left the filter applied but its column never marked active.
       */
      columnKey: nameInUse === spec.paramKey ? spec.columnKey : nameInUse,
      operator: operator as DataTableFilterState["operator"],
      value,
      valueTo: valueTo || undefined,
    });

    // The endpoint keys off the filter value being present, so a valueless
    // operator sends a marker the repository ignores when building the clause.
    const outboundValue = value || (comparesNothing ? "-" : value);

    queryParams.push(
      { key: `${spec.paramKey}Filter`, value: outboundValue },
      { key: `${spec.paramKey}FilterOperator`, value: operator },
    );
    searchParams[`${spec.paramKey}Filter`] = outboundValue;
    searchParams[`${spec.paramKey}FilterOperator`] = operator;

    if (valueTo) {
      queryParams.push({ key: `${spec.paramKey}FilterTo`, value: valueTo });
      searchParams[`${spec.paramKey}FilterTo`] = valueTo;
    }
  }

  return { tableFilters, queryParams, searchParams };
}
