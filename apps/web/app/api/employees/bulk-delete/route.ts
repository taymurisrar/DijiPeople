import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function DELETE(request: Request) {
  const body = await request.json();
  const response = await apiRequest("/employees/bulk-delete", {
    method: "DELETE",
    body: JSON.stringify(body),
  });

  return proxyApiJsonResponse(response);
}
