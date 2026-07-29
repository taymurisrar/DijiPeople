import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(`/employee-bank-accounts/${id}/reject`, {
      method: "POST",
      body: await request.text(),
    }),
  );
}
