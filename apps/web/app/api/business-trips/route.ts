import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  const { search } = new URL(request.url);
  return proxyApiJsonResponse(await apiRequest(`/business-trips${search}`));
}

export async function POST(request: Request) {
  return proxyApiJsonResponse(
    await apiRequest("/business-trips", {
      method: "POST",
      body: await request.text(),
    }),
  );
}
