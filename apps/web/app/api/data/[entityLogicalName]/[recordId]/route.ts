import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type Context = { params: Promise<{ entityLogicalName: string; recordId: string }> };

export async function PATCH(request: Request, context: Context) {
  return mutate(request, context, "PATCH");
}

export async function DELETE(request: Request, context: Context) {
  return mutate(request, context, "DELETE");
}

async function mutate(request: Request, context: Context, method: "PATCH" | "DELETE") {
  const { entityLogicalName, recordId } = await context.params;
  const query = new URL(request.url).searchParams.toString();
  const response = await apiRequest(
    `/data/${encodeURIComponent(entityLogicalName)}/${encodeURIComponent(recordId)}${query ? `?${query}` : ""}`,
    {
      method,
      ...(method === "PATCH" ? { body: JSON.stringify(await request.json()) } : {}),
    },
  );
  return proxyApiJsonResponse(response);
}
