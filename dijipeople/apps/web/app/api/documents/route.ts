import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const response = await apiRequest(`/documents${query ? `?${query}` : ""}`, {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  try {
    const response = await apiRequest(
      contentType.includes("multipart/form-data") ? "/documents/upload" : "/documents/upload",
      {
      method: "POST",
      body: contentType.includes("multipart/form-data")
        ? await request.formData()
        : JSON.stringify(await request.json()),
      },
    );

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to register document metadata." },
      { status: 500 },
    );
  }
}
