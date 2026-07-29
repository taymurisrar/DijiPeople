import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ employeeId: string; id: string }> },
) {
  const { employeeId, id } = await params;
  return proxyApiJsonResponse(
    await apiRequest(`/employees/${employeeId}/compensation-history/${id}`, {
      method: "PATCH",
      body: await request.text(),
    }),
  );
}
