import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
export async function GET() {
  return proxyApiJsonResponse(await apiRequest("/banks"));
}
export async function POST(request: Request) {
  return proxyApiJsonResponse(
    await apiRequest("/banks", { method: "POST", body: await request.text() }),
  );
}
