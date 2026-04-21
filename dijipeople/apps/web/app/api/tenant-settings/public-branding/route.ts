import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tenantSlug = searchParams.get("tenantSlug");
  const query = tenantSlug
    ? `?tenantSlug=${encodeURIComponent(tenantSlug)}`
    : "";

  const response = await apiRequest(`/tenant-settings/public-branding${query}`, {
    method: "GET",
    includeAuth: false,
  });

  return proxyApiJsonResponse(response);
}
