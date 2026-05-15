import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const response = await apiRequest(
    `/public/tenants/resolve${query ? `?${query}` : ""}`,
    { includeAuth: false },
  );

  if (!response.ok) {
    return proxyApiJsonResponse(response);
  }

  const nextResponse = await proxyApiJsonResponse(response);
  nextResponse.headers.set("Cache-Control", "private, max-age=300");
  return nextResponse;
}
