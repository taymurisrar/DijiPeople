import { apiRequest, proxyApiFileResponse } from "@/lib/server-api";

export async function GET(
  _request: Request,
  context: { params: Promise<{ invoiceId: string }> },
) {
  const { invoiceId } = await context.params;
  return proxyApiFileResponse(
    await apiRequest(`/super-admin/invoices/${invoiceId}/pdf`),
  );
}
