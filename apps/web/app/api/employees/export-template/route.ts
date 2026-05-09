import { apiRequest, proxyApiFileResponse } from "@/lib/server-api";

export async function GET() {
  const response = await apiRequest("/employees/export-template", {
    method: "GET",
  });

  return proxyApiFileResponse(response);
}
