import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ employeeId: string }> },
) {
  const { employeeId } = await params;
  return proxyApiJsonResponse(
    await apiRequest(`/employees/${employeeId}/compensation-history`),
  );
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ employeeId: string }> },
) {
  const { employeeId } = await params;
  return proxyApiJsonResponse(
    await apiRequest(`/employees/${employeeId}/compensation-history`, {
      method: "POST",
      body: await request.text(),
    }),
  );
}
