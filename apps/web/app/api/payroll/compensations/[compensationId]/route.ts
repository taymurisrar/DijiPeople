import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(
  _request: Request,
  context: { params: Promise<{ compensationId: string }> },
) {
  const { compensationId } = await context.params;
  const response = await apiRequest(`/payroll/compensations/${compensationId}`, {
    method: "GET",
  });
  return proxyApiJsonResponse(response);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ compensationId: string }> },
) {
  const { compensationId } = await context.params;

  try {
    const body = await normalizeCompensationPayload(await readRequestJson(request));
    const response = await apiRequest(`/payroll/compensations/${compensationId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to update employee compensation.",
      },
      { status: 500 },
    );
  }
}

async function readRequestJson(request: Request) {
  const text = await request.text();
  if (!text.trim()) return {};

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

async function normalizeCompensationPayload(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const values = body as Record<string, unknown>;
  const response = await apiRequest("/pay-components?isActive=true", {
    method: "GET",
  });
  const payComponents = await response.json().catch(() => []) as Array<Record<string, unknown>>;
  const components: Array<{
    payComponentId: string;
    amount?: string;
    percentage?: string;
    isRecurring?: boolean;
    displayOrder?: number;
  }> = payComponents.flatMap((component) => {
    const id = stringValue(component.id);
    if (!id) return [];
    const fieldName = `component_${id}`;
    if (!Object.prototype.hasOwnProperty.call(values, fieldName)) return [];
    const rawValue = values[fieldName];
    const value =
      rawValue === null || rawValue === undefined ? "" : String(rawValue).trim();
    const calculationMethod = stringValue(component.calculationMethod);
    return [
      {
        payComponentId: id,
        ...(calculationMethod === "PERCENTAGE"
          ? { percentage: value || undefined }
          : { amount: value || undefined }),
        isRecurring:
          typeof component.isRecurring === "boolean"
            ? component.isRecurring
            : undefined,
        displayOrder:
          typeof component.displayOrder === "number"
            ? component.displayOrder
            : undefined,
      },
    ];
  });
  const basicSalary =
    stringValue(values.basicSalary) ||
    components.find((component) => stringValue(component.amount))?.amount ||
    "0";

  return {
    ...pickCompensationFields(values),
    basicSalary,
    components,
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function pickCompensationFields(values: Record<string, unknown>) {
  const payload: Record<string, unknown> = {};
  for (const key of [
    "employeeId",
    "payFrequency",
    "effectiveDate",
    "endDate",
    "currency",
    "payrollStatus",
    "paymentMode",
    "payrollGroup",
    "bankName",
    "bankAccountTitle",
    "bankAccountNumber",
    "bankIban",
    "bankRoutingNumber",
    "taxIdentifier",
    "notes",
  ]) {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      payload[key] = values[key];
    }
  }
  return payload;
}
