import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ paymentId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { paymentId } = await context.params;
  const response = await apiRequest(
    `/billing/payments/${encodeURIComponent(paymentId)}`,
    { method: "GET" },
  );
  return proxyApiJsonResponse(response);
}
