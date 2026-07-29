import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(`/employee-tax-profiles/${encodeURIComponent(id)}`),
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(`/employee-tax-profiles/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: await request.text(),
    }),
  );
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(`/employee-tax-profiles/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  );
}
