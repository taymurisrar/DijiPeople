import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => ({}));

    const response = await apiRequest("/data-management/exports", {
      method: "POST",
      body: JSON.stringify(body ?? {}),
      headers: { "Content-Type": "application/json" },
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to start the export.",
      },
      { status: 500 },
    );
  }
}
