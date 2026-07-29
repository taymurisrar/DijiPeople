import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{
    candidateId: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { candidateId } = await context.params;
  const response = await apiRequest(`/candidates/${candidateId}`, {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { candidateId } = await context.params;
  const body = await request.json();

  const response = await apiRequest(`/candidates/${candidateId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

  return proxyApiJsonResponse(response);
}

export async function DELETE(_: Request, context: RouteContext) {
  const { candidateId } = await context.params;

  const response = await apiRequest(`/candidates/${candidateId}`, {
    method: "DELETE",
  });

  return proxyApiJsonResponse(response);
}
