import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function POST(request: Request) {
  const formData = await request.formData();

  const response = await apiRequest("/employees/import", {
    method: "POST",
    body: formData,
  });

  return proxyApiJsonResponse(response);
}
