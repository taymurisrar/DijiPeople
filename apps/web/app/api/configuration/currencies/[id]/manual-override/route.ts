import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(
      `/configuration/currencies/${encodeURIComponent(id)}/manual-override`,
    ),
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(
      `/configuration/currencies/${encodeURIComponent(id)}/manual-override`,
      {
        method: "PATCH",
        body: JSON.stringify(await request.json()),
      },
    ),
  );
}
