import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => ({}));

    const response = await apiRequest("/data-management/exports", {
      method: "POST",
      body: JSON.stringify(body ?? {}),
      headers: { "Content-Type": "application/json" },
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to start the export.");
  }
}
