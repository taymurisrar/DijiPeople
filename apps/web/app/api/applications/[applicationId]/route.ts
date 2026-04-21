import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{
    applicationId: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { applicationId } = await context.params;
  const response = await apiRequest(`/applications/${applicationId}`, {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}
