import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

type RouteContext = {
  params: Promise<{
    candidateId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { candidateId } = await context.params;
  const body = await request.json();

  try {
    const response = await apiRequest(`/candidates/${candidateId}/documents`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to register candidate document metadata.");
  }
}
