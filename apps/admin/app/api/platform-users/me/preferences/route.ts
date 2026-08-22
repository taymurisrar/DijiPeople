import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  try {
    return proxyApiJsonResponse(
      await apiRequest("/platform-users/me/preferences"),
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to read workspace preferences.",
      },
      { status: 502 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const response = await apiRequest("/platform-users/me/preferences", {
      method: "PATCH",
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
            : "Unable to save workspace preferences.",
      },
      { status: 502 },
    );
  }
}
