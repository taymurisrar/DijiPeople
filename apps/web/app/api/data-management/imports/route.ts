import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  const moduleKey = new URL(request.url).searchParams.get("moduleKey");

  try {
    const response = await apiRequest(
      `/data-management/imports${moduleKey ? `?moduleKey=${encodeURIComponent(moduleKey)}` : ""}`,
      { method: "GET" },
    );

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to load import history.",
      },
      { status: 500 },
    );
  }
}
