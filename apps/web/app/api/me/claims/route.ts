import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  return proxyApiJsonResponse(await apiRequest("/me/claims"));
}

export async function POST(request: Request) {
  return proxyApiJsonResponse(
    await apiRequest("/me/claims", {
      method: "POST",
      body: await request.text(),
    }),
  );
}
