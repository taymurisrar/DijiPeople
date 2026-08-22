import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

type RouteContext = {
  params: Promise<{
    documentId: string;
  }>;
};

export async function DELETE(_: Request, context: RouteContext) {
  const { documentId } = await context.params;

  try {
    const response = await apiRequest(`/documents/${documentId}`, {
      method: "DELETE",
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to delete document.");
  }
}
