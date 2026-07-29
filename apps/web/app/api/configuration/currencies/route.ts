import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  const response = await apiRequest("/configuration/currencies", {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}

export async function POST(request: Request) {
  return proxyApiJsonResponse(
    await apiRequest("/configuration/currencies", {
      method: "POST",
      body: JSON.stringify(await request.json()),
    }),
  );
}
