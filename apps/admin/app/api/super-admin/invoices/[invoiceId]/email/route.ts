import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function POST(
  _request: Request,
  context: { params: Promise<{ invoiceId: string }> },
) {
  const { invoiceId } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(`/super-admin/invoices/${invoiceId}/email`, {
      method: "POST",
    }),
  );
}
