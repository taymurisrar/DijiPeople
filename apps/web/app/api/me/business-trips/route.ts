import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  return proxyApiJsonResponse(await apiRequest("/me/business-trips"));
}

export async function POST(request: Request) {
  return proxyApiJsonResponse(
    await apiRequest("/me/business-trips", {
      method: "POST",
      body: await request.text(),
    }),
  );
}
