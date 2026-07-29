import { StandardModuleListPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { buildStandardRouteRuntime } from "@/lib/runtime/modules/standard-module-route-helpers";
import { employeeBankAccountRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";
import { apiRequestJson } from "@/lib/server-api";

export default async function EmployeeBankAccountsPage() {
  const [data, user] = await Promise.all([
    apiRequestJson<unknown>("/employee-bank-accounts"),
    getSessionUser(),
  ]);
  const rows = readRecordList(data);
  const records = rows.map((row) => {
    const employee = isRecord(row.employee) ? row.employee : {};
    const bank = isRecord(row.bank) ? row.bank : {};
    return { ...row, employeeName: [employee.firstName, employee.lastName].filter((value) => typeof value === "string").join(" "), bankName: bank.name };
  });
  const runtime = buildStandardRouteRuntime({ pageKind: "list", sessionUser: user, spec: employeeBankAccountRuntimeSpec });
  return <main className="grid gap-6"><StandardModuleListPage records={records} runtime={runtime} spec={employeeBankAccountRuntimeSpec} title="Employee Bank Accounts" /></main>;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function readRecordList(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];
  for (const value of [data.items, data.records, data.results]) {
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  return isRecord(data.data) ? readRecordList(data.data) : [];
}
