import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

export async function GET() {
  const response = await apiRequest("/agent/settings", { method: "GET" });
  return proxyApiJsonResponse(response);
}

export async function PATCH(request: Request) {
  const body = await request.json();

  try {
    const response = await apiRequest("/agent/settings", {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to update desktop agent settings.");
  }
}
