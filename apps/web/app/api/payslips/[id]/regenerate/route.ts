import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
type Context = { params: Promise<{ id: string }> };
export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(`/payslips/${encodeURIComponent(id)}/regenerate`, {
      method: "POST",
    }),
  );
}
