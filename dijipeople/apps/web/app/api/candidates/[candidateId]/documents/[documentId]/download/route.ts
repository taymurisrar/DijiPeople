import { apiRequest, proxyApiFileResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ candidateId: string; documentId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { candidateId, documentId } = await context.params;
  const response = await apiRequest(
    `/candidates/${candidateId}/documents/${documentId}/download`,
    { method: "GET" },
  );
  return proxyApiFileResponse(response);
}
