import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{
    employeeId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { employeeId } = await context.params;

  try {
    const response = await apiRequest(`/employees/${employeeId}/resend-invite`, {
      method: "POST",
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to resend invitation.",
      },
      { status: 500 },
    );
  }
}
