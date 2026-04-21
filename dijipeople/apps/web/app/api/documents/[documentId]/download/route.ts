import { apiRequest, proxyApiFileResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { documentId } = await context.params;
  const response = await apiRequest(`/documents/${documentId}/download`, {
    method: "GET",
  });

  return proxyApiFileResponse(response);
}
