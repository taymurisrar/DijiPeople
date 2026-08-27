import { NextRequest } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const response = await apiRequest(
    `/customers${url.search ? url.search : ""}`,
    { method: "GET" },
  );

  return proxyApiJsonResponse(response);
}

export async function POST(request: NextRequest) {
  const response = await apiRequest("/customers", {
    method: "POST",
    body: await request.text(),
    headers: { "Content-Type": "application/json" },
  });

  return proxyApiJsonResponse(response);
}
