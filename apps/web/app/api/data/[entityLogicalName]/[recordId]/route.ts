import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type Context = { params: Promise<{ entityLogicalName: string; recordId: string }> };

/*
 * BUG-3494 — the runtime record page reloads a custom record through the
 * standard data adapter's `getById`, which reads this path. Forwarding only;
 * the API decides access.
 */
export async function GET(_request: Request, context: Context) {
  const { entityLogicalName, recordId } = await context.params;
  const response = await apiRequest(
    `/data/${encodeURIComponent(entityLogicalName)}/${encodeURIComponent(recordId)}`,
    { method: "GET" },
  );
  return proxyApiJsonResponse(response);
}

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
