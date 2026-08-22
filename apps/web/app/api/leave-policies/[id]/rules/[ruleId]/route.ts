import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

type RouteContext = {
  params: Promise<{ id: string; ruleId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id, ruleId } = await context.params;
  const body = await request.json();

  try {
    const response = await apiRequest(`/leave-policies/${id}/rules/${ruleId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to update leave policy rule.");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id, ruleId } = await context.params;

  try {
    const response = await apiRequest(`/leave-policies/${id}/rules/${ruleId}`, {
      method: "DELETE",
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to delete leave policy rule.");
  }
}
