import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  const query = new URL(request.url).search;
  return proxyApiJsonResponse(await apiRequest(`/payroll/posting-rules${query}`));
}

export async function POST(request: Request) {
  return proxyApiJsonResponse(
    await apiRequest("/payroll/posting-rules", {
      method: "POST",
      body: await request.text(),
    }),
  );
}
