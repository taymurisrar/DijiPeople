import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function POST(request: Request) {
  try {
    const response = await apiRequest("/documents/upload", {
      method: "POST",
      body: await request.formData(),
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to upload document.",
      },
      { status: 500 },
    );
  }
}
