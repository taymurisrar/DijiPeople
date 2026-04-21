import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  try {
    const response = await apiRequest("/lookups/document-types", {
      method: "GET",
    });
    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to load document types.",
      },
      { status: 502 },
    );
  }
}
