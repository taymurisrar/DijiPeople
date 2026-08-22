import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

type RouteContext = {
  params: Promise<{ employeeId: string; id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { employeeId, id } = await context.params;
  const body = await request.json();

  try {
    const response = await apiRequest(
      `/employees/${employeeId}/compensation-history/${id}/components`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to add compensation component.");
  }
}
