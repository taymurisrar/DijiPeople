import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

/**
 * Thin proxy. The API verifies the current password, applies the strength rules
 * and revokes the other sessions — none of that is repeated here, and the
 * request body is forwarded untouched so nothing about it can be logged or
 * reshaped on the way through.
 */
export async function POST(request: Request) {
  try {
    const response = await apiRequest("/platform-users/me/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
    });
    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to reach the account security service.",
      },
      { status: 502 },
    );
  }
}
