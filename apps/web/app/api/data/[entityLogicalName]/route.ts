import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(
  request: Request,
  context: { params: Promise<{ entityLogicalName: string }> },
) {
  const { entityLogicalName } = await context.params;
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const response = await apiRequest(
    `/data/${encodeURIComponent(entityLogicalName)}${query ? `?${query}` : ""}`,
    { method: "GET" },
  );

  return proxyApiJsonResponse(response);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ entityLogicalName: string }> },
) {
  return mutate(request, context, "POST");
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ entityLogicalName: string }> },
) {
  return mutate(request, context, "DELETE");
}

async function mutate(
  request: Request,
  context: { params: Promise<{ entityLogicalName: string }> },
  method: "POST" | "DELETE",
) {
  const { entityLogicalName } = await context.params;
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const response = await apiRequest(
    `/data/${encodeURIComponent(entityLogicalName)}${query ? `?${query}` : ""}`,
    { method, body: JSON.stringify(await request.json()) },
  );
  return proxyApiJsonResponse(response);
}
