import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { jobId } = await context.params;
  const response = await apiRequest(`/job-openings/${jobId}`, {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { jobId } = await context.params;
  const body = await request.json();
  const response = await apiRequest(`/job-openings/${jobId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

  return proxyApiJsonResponse(response);
}
