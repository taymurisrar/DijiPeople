import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { invoiceId } = await context.params;
  const response = await apiRequest(
    `/billing/invoices/${encodeURIComponent(invoiceId)}`,
    { method: "GET" },
  );
  return proxyApiJsonResponse(response);
}
