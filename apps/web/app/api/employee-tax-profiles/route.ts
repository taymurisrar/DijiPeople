import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  const search = new URL(request.url).search;
  return proxyApiJsonResponse(
    await apiRequest(`/employee-tax-profiles${search}`),
  );
}

export async function POST(request: Request) {
  return proxyApiJsonResponse(
    await apiRequest("/employee-tax-profiles", {
      method: "POST",
      body: await request.text(),
    }),
  );
}
