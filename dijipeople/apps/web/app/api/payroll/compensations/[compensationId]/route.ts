import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ compensationId: string }> },
) {
  const { compensationId } = await context.params;
  const body = await request.json();

  try {
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

