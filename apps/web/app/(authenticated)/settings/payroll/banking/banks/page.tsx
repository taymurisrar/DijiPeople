import { StandardModuleListPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { buildStandardRouteRuntime } from "@/lib/runtime/modules/standard-module-route-helpers";
import { bankRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";
import { apiRequestJson } from "@/lib/server-api";

export default async function PayrollBanksPage() {
  const user = await getSessionUser();
  const banks = await apiRequestJson<Array<Record<string, unknown>>>("/banks");
  const runtime = buildStandardRouteRuntime({
    pageKind: "list",
    sessionUser: user,
    spec: bankRuntimeSpec,
  });

  return (
    <StandardModuleListPage
      pagination={{
        page: 1,
        pageSize: Math.max(banks.length, 20),
        totalItems: banks.length,
        pathname: "/settings/payroll/banking/banks",
        searchParams: {},
      }}
      paginationMode="client"
      records={banks}
      runtime={runtime}
      spec={bankRuntimeSpec}
      title="Banks"
    />
  );
}
