import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  return proxyApiJsonResponse(await apiRequest("/currency-configurations"));
}

export async function POST(request: Request) {
  return proxyApiJsonResponse(
    await apiRequest("/currency-configurations", {
      method: "POST",
      body: JSON.stringify(await request.json()),
    }),
  );
}
