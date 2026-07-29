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
  let response = await apiRequest(
    `/payslips?employeeId=${encodeURIComponent(employeeId)}`,
  );
  if (response.status === 403) {
    response = await apiRequest("/me/payslips");
  }
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
