import { apiRequest, proxyApiFileResponse } from "@/lib/server-api";

export async function GET() {
  const response = await apiRequest("/platform/logs/latest-error/download");
  return proxyApiFileResponse(response);
}
