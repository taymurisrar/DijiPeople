import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

export async function GET(request: Request) {
  const moduleKey = new URL(request.url).searchParams.get("moduleKey");

  try {
    const response = await apiRequest(
      `/data-management/imports${moduleKey ? `?moduleKey=${encodeURIComponent(moduleKey)}` : ""}`,
      { method: "GET" },
    );

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to load import history.");
  }
}
