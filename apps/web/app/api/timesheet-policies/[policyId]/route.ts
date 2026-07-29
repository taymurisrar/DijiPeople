import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = { params: Promise<{ policyId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { policyId } = await context.params;
  const query = new URL(request.url).searchParams.toString();
  const response = await apiRequest(
    `/timesheet-policies/${encodeURIComponent(policyId)}${query ? `?${query}` : ""}`,
  );
  return proxyApiJsonResponse(response);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { policyId } = await context.params;
  try {
    const response = await apiRequest(
      `/timesheet-policies/${encodeURIComponent(policyId)}`,
      { method: "PATCH", body: JSON.stringify(await request.json()) },
    );
    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to update timesheet policy.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { policyId } = await context.params;
  const response = await apiRequest(
    `/timesheet-policies/${encodeURIComponent(policyId)}`,
    { method: "DELETE" },
  );
  return proxyApiJsonResponse(response);
}
