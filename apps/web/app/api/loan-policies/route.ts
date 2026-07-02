import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
export async function GET() {
  return proxyApiJsonResponse(await apiRequest("/loan-policies"));
}
export async function POST(request: Request) {
  return proxyApiJsonResponse(
    await apiRequest("/loan-policies", {
      method: "POST",
      body: await request.text(),
    }),
  );
}
