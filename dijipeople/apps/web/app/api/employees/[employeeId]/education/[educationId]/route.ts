import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ employeeId: string; educationId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { employeeId, educationId } = await context.params;
  const body = await request.json();

  try {
    const response = await apiRequest(
      `/employees/${employeeId}/education/${educationId}`,
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
            : "Unable to update employee education record.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { employeeId, educationId } = await context.params;

  try {
    const response = await apiRequest(
      `/employees/${employeeId}/education/${educationId}`,
      {
        method: "DELETE",
      },
    );

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to delete employee education record.",
      },
      { status: 500 },
    );
  }
}
