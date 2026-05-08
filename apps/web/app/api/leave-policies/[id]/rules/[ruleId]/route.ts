import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ id: string; ruleId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id, ruleId } = await context.params;
  const body = await request.json();

  try {
    const response = await apiRequest(`/leave-policies/${id}/rules/${ruleId}`, {
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
            : "Unable to update leave policy rule.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id, ruleId } = await context.params;

  try {
    const response = await apiRequest(`/leave-policies/${id}/rules/${ruleId}`, {
      method: "DELETE",
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to delete leave policy rule.",
      },
      { status: 500 },
    );
  }
}
