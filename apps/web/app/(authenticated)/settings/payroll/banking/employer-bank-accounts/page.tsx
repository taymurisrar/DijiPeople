import { StandardModuleListPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { buildStandardRouteRuntime } from "@/lib/runtime/modules/standard-module-route-helpers";
import { employerBankAccountRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";
import { apiRequestJson } from "@/lib/server-api";

export default async function EmployerBankAccountsPage() {
  const [data, user] = await Promise.all([
    apiRequestJson<unknown>("/payroll/employer-bank-accounts"),
    getSessionUser(),
  ]);
  const records = readRecords(data).map((row) => ({
    ...row,
    bankName: isRecord(row.bank) ? row.bank.name : undefined,
  }));
  const runtime = buildStandardRouteRuntime({
    pageKind: "list",
    sessionUser: user,
    spec: employerBankAccountRuntimeSpec,
  });
  return (
    <div className="grid gap-6">
      <StandardModuleListPage
        records={records}
        runtime={runtime}
        spec={employerBankAccountRuntimeSpec}
        title="Employer Bank Accounts"
      />
    </div>
  );
}

function readRecords(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (isRecord(data) && Array.isArray(data.items)) return data.items.filter(isRecord);
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

