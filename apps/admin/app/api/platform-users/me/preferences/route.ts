import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

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
            : "Unable to save dashboard preference.",
      },
      { status: 502 },
    );
  }
}
