import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type Context = { params: Promise<{ category: string }> };

export async function GET(_request: Request, context: Context) {
  const { category } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(`/tenant-settings/${encodeURIComponent(category)}`),
  );
}

export async function PATCH(request: Request, context: Context) {
  const { category } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(`/tenant-settings/${encodeURIComponent(category)}`, {
      method: "PATCH",
      body: await request.text(),
    }),
  );
}
