import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyApiJsonResponse(
    await apiRequest(`/payroll/employer-bank-accounts/${id}/deactivate`, {
      method: "POST",
    }),
  );
}

