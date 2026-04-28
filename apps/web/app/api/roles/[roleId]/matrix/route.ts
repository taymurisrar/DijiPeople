import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RoleMatrixRouteContext = {
  params: Promise<{ roleId: string }>;
};

export async function PUT(request: Request, context: RoleMatrixRouteContext) {
  const { roleId } = await context.params;
  const response = await apiRequest(`/roles/${roleId}/matrix`, {
    method: "PUT",
    body: await request.text(),
    headers: {
      "Content-Type": "application/json",
    },
  });

  return proxyApiJsonResponse(response);
}
