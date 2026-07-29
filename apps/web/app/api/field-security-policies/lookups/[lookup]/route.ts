import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type FieldSecurityLookupRouteContext = {
  params: Promise<{ lookup: string }>;
};

export async function GET(
  request: Request,
  context: FieldSecurityLookupRouteContext,
) {
  const { lookup } = await context.params;
  const query = new URL(request.url).search;
  const response = await apiRequest(
    `/field-security-policies/lookups/${encodeURIComponent(lookup)}${query}`,
    { method: "GET" },
  );

  return proxyApiJsonResponse(response);
}
