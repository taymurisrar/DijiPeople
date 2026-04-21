import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  const response = await apiRequest("/tenant-settings", {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}

export async function PATCH(request: Request) {
  const body = await request.json();

  try {
    const response = await apiRequest("/tenant-settings", {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to update tenant settings.",
      },
      { status: 500 },
    );
  }
}

