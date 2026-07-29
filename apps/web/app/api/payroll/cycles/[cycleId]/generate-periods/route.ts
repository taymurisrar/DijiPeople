import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function POST(
  request: Request,
  context: { params: Promise<{ cycleId: string }> },
) {
  const { cycleId } = await context.params;

  try {
    const response = await apiRequest(
      `/payroll/cycles/${encodeURIComponent(cycleId)}/generate-periods`,
      { method: "POST", body: await request.text() },
    );
    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to generate payroll periods.",
      },
      { status: 500 },
    );
  }
}
