import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ employeeId: string; id: string; componentId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { employeeId, id, componentId } = await context.params;
  const body = await request.json();

  try {
    const response = await apiRequest(
      `/employees/${employeeId}/compensation-history/${id}/components/${componentId}`,
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
            : "Unable to update compensation component.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { employeeId, id, componentId } = await context.params;
  const response = await apiRequest(
    `/employees/${employeeId}/compensation-history/${id}/components/${componentId}`,
    { method: "DELETE" },
  );

  return proxyApiJsonResponse(response);
}
