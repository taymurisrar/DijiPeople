import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { hasPermission, isSelfServiceUser } from "@/lib/permissions";
import { apiRequestJson } from "@/lib/server-api";
import { buildEntityDataUrl } from "@/app/components/entity-data/entity-query-builder";
import {
  EntityDataResponse,
  EntityFilter,
} from "@/app/components/entity-data/entity-query-types";
import { ModuleViewSelector } from "@/app/components/view-selector/module-view-selector";
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
import { EmployeeListResponse } from "./types";
import { TenantResolvedSettingsResponse } from "../settings/types";
import { EmployeesTable } from "./_components/employees-table";
import { EmployeesCommandBar } from "./_components/employees-command-bar";
import { DataTableFilterState } from "@/app/components/data-table/types";

type EmployeesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EmployeesPage({
  searchParams,
}: EmployeesPageProps) {
  const businessUnitAccess = await getBusinessUnitAccessSummary();

  if (!hasBusinessUnitScope(businessUnitAccess)) {
    return (
      <main className="dp-theme-scope dp-employees-scope grid gap-6">
        <AccessDeniedState
          description="Your current business-unit scope does not include employee records."
          title="Employees are unavailable for your current business unit access."
        />
      </main>
    );
  }

  const user = await getSessionUser();

  const canCreateEmployee = hasPermission(
    user?.permissionKeys,
    "employees.create",
  );
  const canDeleteEmployee = hasPermission(
    user?.permissionKeys,
    "employees.delete",
  );
  const canShareEmployee = hasPermission(
    user?.permissionKeys,
    "employees.share",
  );
  const canAssignEmployee = hasPermission(
    user?.permissionKeys,
    "employees.assign",
  );
  const canImportEmployee = hasPermission(
    user?.permissionKeys,
    "employees.import",
  );
  const canExportEmployee = hasPermission(
    user?.permissionKeys,
    "employees.export",
  );

  if (user && isSelfServiceUser(user.permissionKeys)) {
    redirect("/dashboard/profile");
  }

  const params = await searchParams;
  const search = getSearchParam(params.search);
  const employmentStatus = getSearchParam(params.employmentStatus);
  const reportingManagerEmployeeId = getSearchParam(
    params.reportingManagerEmployeeId,
  );
  const selectedViewKey = getSearchParam(params.view);
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

  const employeeViews = withFallbackViews("employees", publishedViews, [
    {
      id: "allEmployees",
      viewKey: "allEmployees",
      tableKey: "employees",
      name: "All Employees",
      type: "system",
      isDefault: true,
      columnsJson: {
        columns: [
          { columnKey: "firstName" },
          { columnKey: "employeeCode" },
          { columnKey: "employmentStatus" },
          { columnKey: "managerEmployeeId" },
          { columnKey: "hireDate" },
          { columnKey: "email" },
        ],
      },
      sortingJson: [{ columnKey: "firstName", direction: "asc" }],
    },
  ]);

  const selectedView =
    employeeViews.find((view) => view.viewKey === selectedViewKey) ??
    employeeViews.find((view) => view.isDefault) ??
    employeeViews[0] ??
    null;

  const visibleColumnKeys = resolveVisibleColumns("employees", selectedView, [
    "firstName",
    "employeeCode",
    "employmentStatus",
    "managerEmployeeId",
    "hireDate",
    "email",
  ]);

  const viewState = resolveFiltersAndSorting("employees", selectedView);
  const initialSort = resolveEmployeeSort(viewState.sorting);

  const formatting = {
    dateFormat: resolvedSettings?.system.dateFormat || "MM/dd/yyyy",
    locale: resolvedSettings?.system.locale || "en-US",
    timezone:
      resolvedSettings?.organization.timezone ||
      resolvedSettings?.system.defaultTimezone ||
      "UTC",
  };

  return (
    <main className="dp-theme-scope dp-employees-scope grid gap-6">
      <ModuleViewSelector
        configureHref="/dashboard/settings/customization/tables/employees"
        enabled
        selectedViewId={selectedView?.viewKey ?? ""}
        views={employeeViews}
      />

      <EmployeesCommandBar
        canCreateEmployee={canCreateEmployee}
        canDeleteEmployee={canDeleteEmployee}
        canShareEmployee={canShareEmployee}
        canAssignEmployee={canAssignEmployee}
        canImportEmployee={canImportEmployee}
        canExportEmployee={canExportEmployee}
      />

      <EmployeesTable
        employees={employees.items}
        canDeleteEmployee={canDeleteEmployee}
        canAssignEmployee={canAssignEmployee}
        formatting={formatting}
        initialSortColumnKey={initialSort.columnKey}
        initialSortDirection={initialSort.direction}
        pagination={{
          page: employees.meta?.page ?? page,
          pageSize: employees.meta?.pageSize ?? pageSize,
          totalItems: employees.meta?.total ?? employees.items.length,
          pathname: "/dashboard/employees",
          searchParams: {
            search,
            employmentStatus,
            reportingManagerEmployeeId,
            orderBy,
            ...columnFilters.searchParams,
          },
        }}
        initialFilters={columnFilters.tableFilters}
        useEntityDataApi={useEntityDataApi}
        visibleColumnKeys={visibleColumnKeys}
      />
    </main>
  );
}

type EmployeeEntityRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  employeeCode: string;
  employmentStatus: EmployeeListResponse["items"][number]["employmentStatus"];
  hireDate?: string | null;
  managerEmployeeId?: string | null;
  manager?: {
    id: string;
    firstName: string;
    lastName: string;
    employeeCode: string;
    email?: string | null;
  } | null;
};

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

  const response = await apiRequestJson<EntityDataResponse<EmployeeEntityRecord>>(
    url,
  );

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

function resolveEmployeeSort(sorting: unknown) {
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
    firstName: "employee",
    lastName: "employee",
    employeeCode: "code",
    employmentStatus: "status",
    managerEmployeeId: "reportingManager",
    hireDate: "hireDate",
    email: "contact",
    phone: "contact",
  };

  return {
    columnKey:
      typeof columnKey === "string" ? map[columnKey] ?? "employee" : "employee",
    direction: direction === "desc" ? ("desc" as const) : ("asc" as const),
  };
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
  const specs = [
    { columnKey: "employee", paramKey: "name", defaultOperator: "contains" },
    { columnKey: "code", paramKey: "code", defaultOperator: "contains" },
    { columnKey: "status", paramKey: "status", defaultOperator: "equals" },
    {
      columnKey: "reportingManager",
      paramKey: "reportingManager",
      defaultOperator: "contains",
    },
    { columnKey: "hireDate", paramKey: "hireDate", defaultOperator: "equals" },
    { columnKey: "contact", paramKey: "contact", defaultOperator: "contains" },
  ];
  const tableFilters: DataTableFilterState[] = [];
  const queryParams: Array<{ key: string; value: string }> = [];
  const searchParams: Record<string, string> = {};

  for (const spec of specs) {
    const value = getSearchParam(params[`${spec.paramKey}Filter`]);
    const operator =
      getSearchParam(params[`${spec.paramKey}FilterOperator`]) ||
      spec.defaultOperator;
    const valueTo = getSearchParam(params[`${spec.paramKey}FilterTo`]);

    if (!value) continue;

    tableFilters.push({
      columnKey: spec.columnKey,
      operator: operator as DataTableFilterState["operator"],
      value,
      valueTo: valueTo || undefined,
    });

    queryParams.push(
      { key: `${spec.paramKey}Filter`, value },
      { key: `${spec.paramKey}FilterOperator`, value: operator },
    );
    searchParams[`${spec.paramKey}Filter`] = value;
    searchParams[`${spec.paramKey}FilterOperator`] = operator;

    if (valueTo) {
      queryParams.push({ key: `${spec.paramKey}FilterTo`, value: valueTo });
      searchParams[`${spec.paramKey}FilterTo`] = valueTo;
    }
  }

  return { tableFilters, queryParams, searchParams };
}
