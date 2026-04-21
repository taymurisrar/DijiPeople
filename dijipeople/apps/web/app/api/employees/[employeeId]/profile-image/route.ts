import { apiRequest, proxyApiFileResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ employeeId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { employeeId } = await context.params;
  const response = await apiRequest(`/employees/${employeeId}/profile-image`, {
    method: "GET",
  });

  return proxyApiFileResponse(response);
}
