import { NextRequest } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  const response = await apiRequest("/settings/my-preferences", {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}

export async function PATCH(request: NextRequest) {
  const body = await request.text();
  const response = await apiRequest("/settings/my-preferences", {
    method: "PATCH",
    body,
    headers: { "Content-Type": "application/json" },
  });

  return proxyApiJsonResponse(response);
}
