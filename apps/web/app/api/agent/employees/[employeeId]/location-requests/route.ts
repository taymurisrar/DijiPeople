import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function POST(
  request: Request,
  context: { params: Promise<{ employeeId: string }> },
) {
  const { employeeId } = await context.params;
  const body = await request.text();
  const response = await apiRequest(
    `/agent/employees/${encodeURIComponent(employeeId)}/location-requests`,
    {
      method: "POST",
      body: body || "{}",
    },
  );

  return proxyApiJsonResponse(response);
}
