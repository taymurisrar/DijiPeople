import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyApiJsonResponse(
    await apiRequest(`/payroll/employer-bank-accounts/${id}`),
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyApiJsonResponse(
    await apiRequest(`/payroll/employer-bank-accounts/${id}`, {
      method: "PATCH",
      body: await request.text(),
    }),
  );
}

