import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  const response = await apiRequest("/documents/types", { method: "GET" });
  return proxyApiJsonResponse(response);
}

export async function POST(request: Request) {
  const response = await apiRequest("/documents/types", {
    method: "POST",
    body: JSON.stringify(await request.json()),
  });
  return proxyApiJsonResponse(response);
}
