import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; componentId: string }> },
) {
  const { id, componentId } = await params;
  return proxyApiJsonResponse(
    await apiRequest(`/salary-package-rules/${id}/components/${componentId}`, {
      method: "PATCH",
      body: await request.text(),
    }),
  );
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; componentId: string }> },
) {
  const { id, componentId } = await params;
  return proxyApiJsonResponse(
    await apiRequest(`/salary-package-rules/${id}/components/${componentId}`, {
      method: "DELETE",
    }),
  );
}

