import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{
    timesheetId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { timesheetId } = await context.params;

  try {
    const response = await apiRequest(`/timesheets/team/${timesheetId}`);
    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to load team timesheet.",
      },
      { status: 500 },
    );
  }
}
