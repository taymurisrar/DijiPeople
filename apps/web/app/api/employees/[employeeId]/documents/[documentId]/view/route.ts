import { apiRequest, proxyApiFileResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ employeeId: string; documentId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { employeeId, documentId } = await context.params;
  const response = await apiRequest(
    `/employees/${employeeId}/documents/${documentId}/view`,
    { method: "GET" },
  );

  return proxyApiFileResponse(response);
}
