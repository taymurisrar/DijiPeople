import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const response = await apiRequest(
      `/lookups/countries${url.search ? url.search : ""}`,
      { method: "GET" },
    );
    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to load countries.",
      },
      { status: 502 },
    );
  }
}
