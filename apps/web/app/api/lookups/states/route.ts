import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const query = new URLSearchParams();
    const countryId = searchParams.get("countryId");

    if (countryId) {
      query.set("countryId", countryId);
    }

    const response = await apiRequest(
      `/lookups/states${query.size ? `?${query.toString()}` : ""}`,
      { method: "GET" },
    );
    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to load states and provinces.",
      },
      { status: 502 },
    );
  }
}
