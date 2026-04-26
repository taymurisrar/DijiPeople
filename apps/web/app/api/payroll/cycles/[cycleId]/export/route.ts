import { NextResponse } from "next/server";
import { apiRequest, ApiRequestError, proxyApiFileResponse } from "@/lib/server-api";

export async function GET(
  _request: Request,
  context: { params: Promise<{ cycleId: string }> },
) {
  const { cycleId } = await context.params;

  try {
    const response = await apiRequest(`/payroll/cycles/${cycleId}/export`, {
      method: "GET",
    });

    return proxyApiFileResponse(response);
  } catch (error) {
    const status = error instanceof ApiRequestError ? error.status : 500;

    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to export payroll.",
      },
      { status },
    );
  }
}
