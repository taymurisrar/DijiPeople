import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  const response = await apiRequest("/teams", { method: "GET" });
  return proxyApiJsonResponse(response);
}

export async function POST(request: Request) {
  const response = await apiRequest("/teams", {
    method: "POST",
    body: await request.text(),
    headers: {
      "Content-Type": "application/json",
    },
  });
  return proxyApiJsonResponse(response);
}
