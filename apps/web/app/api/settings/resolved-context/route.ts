import { NextRequest, NextResponse } from "next/server";
import { apiRequest } from "@/lib/server-api";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const response = await apiRequest(
    `/settings/resolved-context${url.search ? url.search : ""}`,
    { method: "GET" },
  );

  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
}
