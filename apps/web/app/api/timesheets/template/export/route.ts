import { NextResponse } from "next/server";
import { apiRequest, ApiRequestError, proxyApiFileResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const response = await apiRequest(
      `/timesheets/template/export${url.search ? url.search : ""}`,
      {
        method: "GET",
        timeoutMs: 60_000,
      },
    );

    return proxyApiFileResponse(response);
  } catch (error) {
    const status = error instanceof ApiRequestError ? error.status : 500;

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to export timesheet template.",
      },
      { status },
    );
  }
}
