import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tenantSlug = searchParams.get("tenantSlug");
  const query = tenantSlug
    ? `?tenantSlug=${encodeURIComponent(tenantSlug)}`
    : "";
  const response = await apiRequest(`/tenant-branding/resolved${query}`, {
    includeAuth: false,
  });

  return proxyApiJsonResponse(response);
}
