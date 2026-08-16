import { NextResponse } from "next/server";
import { apiRequest } from "@/lib/server-api";

type PayslipApiRecord = Record<string, unknown> & {
  payrollRun?: {
    payrollPeriod?: {
      name?: unknown;
      periodStart?: unknown;
      periodEnd?: unknown;
      paymentDate?: unknown;
    };
  };
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ employeeId: string }> },
) {
  const { employeeId } = await params;

  /*
   * BUG-0039. This used to re-request `/me/payslips` when the API answered 403
   * and return it as 200 — so a refusal became a success containing a *different
   * employee's* payslips, under a URL naming the employee that was asked for.
   * The caller could not tell, and nothing logged the substitution.
   *
   * `apps/web/AGENTS.md` states the rule this broke twice over: "No
   * authorization decisions. Never decide 'this user may do X' here… A proxy
   * that filters or permits is a second source of truth and a security hole."
   *
   * The 403 is forwarded. A screen that wants the caller's own payslips asks
   * for `/me/payslips` explicitly.
   */
  const response = await apiRequest(
    `/payslips?employeeId=${encodeURIComponent(employeeId)}`,
  );
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    return NextResponse.json(data ?? { message: response.statusText }, {
      status: response.status,
    });
  }

  return NextResponse.json({
    items: extractPayslips(data).map(normalizePayslip),
  });
}

function extractPayslips(data: unknown): PayslipApiRecord[] {
  if (Array.isArray(data)) return data.filter(isRecord) as PayslipApiRecord[];
  if (!isRecord(data)) return [];
  const candidates = [data.items, data.records, data.results, data.data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord) as PayslipApiRecord[];
    }
  }
  return [];
}

function normalizePayslip(row: PayslipApiRecord) {
  const period = row.payrollRun?.payrollPeriod ?? {};
  return {
    ...row,
    periodName: stringValue(period.name),
    periodStart: stringValue(period.periodStart),
    periodEnd: stringValue(period.periodEnd),
    paymentDate: stringValue(period.paymentDate),
  };
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
