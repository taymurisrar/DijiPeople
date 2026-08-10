import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope") ?? "";
  try {
    const response = await apiRequest(
      `/super-admin/promotions/targets?scope=${encodeURIComponent(scope)}`,
    );
    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to reach the API.",
      },
      { status: 502 },
    );
  }
}
