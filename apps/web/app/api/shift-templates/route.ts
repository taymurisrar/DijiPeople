import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  return proxyApiJsonResponse(
    await apiRequest("/shift-templates", { method: "GET" }),
  );
}

export async function POST(request: Request) {
  return proxyApiJsonResponse(
    await apiRequest("/shift-templates", {
      body: JSON.stringify(await request.json()),
      method: "POST",
    }),
  );
}
