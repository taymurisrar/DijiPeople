import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    const response = await apiRequest(
      `/timesheets/mine/monthly?${searchParams.toString()}`,
    );
    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to load monthly timesheet.",
      },
      { status: 500 },
    );
  }
}
