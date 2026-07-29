import { StandardModuleListPage } from "@/app/components/runtime";
import { getSessionUser } from "@/lib/auth";
import { buildStandardRouteRuntime } from "@/lib/runtime/modules/standard-module-route-helpers";
import { benefitAssignmentRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";
import { apiRequestJson } from "@/lib/server-api";

export default async function BenefitAssignmentsPage() {
  const [data, user] = await Promise.all([
    apiRequestJson<unknown>("/benefits/assignments"),
    getSessionUser(),
  ]);
  const rows = readRecordList(data);
  const records = rows.map(normalizeAssignment);
  const runtime = buildStandardRouteRuntime({ pageKind: "list", sessionUser: user, spec: benefitAssignmentRuntimeSpec });
  return <main className="grid gap-6"><StandardModuleListPage records={records} runtime={runtime} spec={benefitAssignmentRuntimeSpec} title="Employee Benefit Assignments" /></main>;
}

function normalizeAssignment(row: Record<string, unknown>) {
  const employee = isRecord(row.employee) ? row.employee : {};
  const policy = isRecord(row.benefitPolicy) ? row.benefitPolicy : {};
  const employeeName = [employee.firstName, employee.lastName].filter((value) => typeof value === "string").join(" ");
  return { ...row, assignmentName: `${employeeName || "Employee"} / ${typeof policy.name === "string" ? policy.name : "Benefit"}`, employeeName, benefitName: policy.name };
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
