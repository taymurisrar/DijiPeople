import { apiRequest, proxyApiFileResponse, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

type RouteContext = {
  params: Promise<{ employeeId: string; documentId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { employeeId, documentId } = await context.params;
  const response = await apiRequest(
    `/employees/${employeeId}/documents/${documentId}/download`,
    { method: "GET" },
  );

  return proxyApiFileResponse(response);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { employeeId, documentId } = await context.params;

  try {
    const response = await apiRequest(
      `/employees/${employeeId}/documents/${documentId}`,
      { method: "DELETE" },
    );

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to delete employee document.");
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { employeeId, documentId } = await context.params;

  try {
    const formData = await request.formData();
    const response = await apiRequest(
      `/employees/${employeeId}/documents/${documentId}`,
      { body: formData, method: "PATCH" },
    );

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to update employee document.");
  }
}
