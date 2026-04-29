import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ employeeId: string; id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { employeeId, id } = await context.params;
  const response = await apiRequest(
    `/employees/${employeeId}/compensation-history/${id}`,
    { method: "GET" },
  );

  return proxyApiJsonResponse(response);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { employeeId, id } = await context.params;
  const body = await request.json();

  try {
    const response = await apiRequest(
      `/employees/${employeeId}/compensation-history/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    );

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to update compensation history.",
      },
      { status: 500 },
    );
  }
}
