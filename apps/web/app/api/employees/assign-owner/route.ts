import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function PATCH(request: Request) {
  const body = await request.json();
  const response = await apiRequest("/employees/assign-owner", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

  return proxyApiJsonResponse(response);
}
