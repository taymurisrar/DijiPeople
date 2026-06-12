import { StandardModuleListPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import {
  buildStandardModuleRuntimeContext,
  buildStandardRuntimePrincipal,
} from "@/lib/runtime/modules/standard-module-runtime";
import { customerRuntimeSpec } from "@/lib/runtime/modules/standard-module-specs";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../_components/access-denied-state";
import {
  getBusinessUnitAccessSummary,
  hasBusinessUnitScope,
} from "../_lib/business-unit-access";

type CustomerRecord = {
  id: string;
  name: string;
  code: string;
  industry?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  status: string;
  _count?: { projects: number };
};

type CustomersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CustomersPage({
  searchParams,
}: CustomersPageProps) {
  const businessUnitAccess = await getBusinessUnitAccessSummary();

  if (!hasBusinessUnitScope(businessUnitAccess)) {
    return (
      <main className="grid gap-6">
        <AccessDeniedState
          description="Your current business-unit scope does not include customer records."
          title="Customers are unavailable for your current business unit access."
        />
      </main>
    );
  }

  const [customers, params, sessionUser] = await Promise.all([
    apiRequestJson<CustomerRecord[]>("/customers"),
    searchParams,
    getSessionUser(),
  ]);
  const runtime = buildStandardModuleRuntimeContext({
    pageKind: "list",
    principal: buildStandardRuntimePrincipal({
      userId: sessionUser?.userId,
      tenantId: sessionUser?.tenantId,
      roleKeys: sessionUser?.roleKeys,
      roles: sessionUser?.roles,
      permissionKeys: sessionUser?.permissionKeys,
    }),
    spec: customerRuntimeSpec,
  });
  const activeView = resolveActiveView(runtime, getSearchParam(params.viewId));
  const records = customers.map((customer) => ({
    ...customer,
    projectCount: customer._count?.projects ?? 0,
  }));

  return (
    <main className="grid gap-6">
      <StandardModuleListPage
        activeView={activeView}
        formatting={{
          dateFormat: "MM/dd/yyyy",
          locale: "en-US",
          timezone: "UTC",
        }}
        pagination={{
          page: 1,
          pageSize: records.length || 10,
          totalItems: records.length,
          pathname: customerRuntimeSpec.routeBase,
          searchParams: {
            viewId: activeView?.viewId ?? activeView?.id,
          },
        }}
        records={records}
        runtime={runtime}
        title="Customers"
      />
    </main>
  );
}

function resolveActiveView(
  runtime: ReturnType<typeof buildStandardModuleRuntimeContext>,
  viewId: string,
) {
  return (
    runtime.metadata.views.find(
      (view) => (view.viewId ?? view.id) === viewId,
    ) ??
    runtime.metadata.views.find((view) => view.isDefault) ??
    runtime.metadata.views[0] ??
    null
  );
}

function getSearchParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}
