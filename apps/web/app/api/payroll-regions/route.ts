import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  return proxyApiJsonResponse(await apiRequest("/payroll-regions"));
}

export async function POST(request: Request) {
  return proxyApiJsonResponse(
    await apiRequest("/payroll-regions", {
      method: "POST",
      body: JSON.stringify(await request.json()),
    }),
  );
}
