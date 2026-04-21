import { NextResponse } from "next/server";
import { apiRequest, proxyApiFileResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const response = await apiRequest(
      `/attendance/export${url.search ? url.search : ""}`,
      {
        method: "GET",
      },
    );

    return proxyApiFileResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to export attendance.",
      },
      { status: 500 },
    );
  }
}
