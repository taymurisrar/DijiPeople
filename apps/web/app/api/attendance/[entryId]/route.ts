import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ entryId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { entryId } = await context.params;

  try {
    const response = await apiRequest(`/attendance/${entryId}`, {
      method: "GET",
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to load attendance record.",
      },
      { status: 500 },
    );
  }
}
