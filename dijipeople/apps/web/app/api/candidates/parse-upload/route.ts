import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const response = await apiRequest("/candidates/parse-upload", {
      method: "POST",
      body: formData,
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to parse uploaded resume.",
      },
      { status: 500 },
    );
  }
}
