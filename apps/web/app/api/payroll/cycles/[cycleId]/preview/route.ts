import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(
  _request: Request,
  context: { params: Promise<{ cycleId: string }> },
) {
  const { cycleId } = await context.params;

  try {
    const response = await apiRequest(`/payroll/cycles/${cycleId}/preview`, {
      method: "GET",
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to preview payroll generation.",
      },
      { status: 500 },
    );
  }
}
