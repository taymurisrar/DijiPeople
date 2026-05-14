import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return proxyApiJsonResponse(
    await apiRequest(`/exchange-rates${url.search ? url.search : ""}`),
  );
}

export async function POST(request: Request) {
  return proxyApiJsonResponse(
    await apiRequest("/exchange-rates", {
      method: "POST",
      body: JSON.stringify(await request.json()),
    }),
  );
}
