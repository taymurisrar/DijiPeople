import { apiRequest, proxyApiFileResponse } from "@/lib/server-api";

export async function GET(
  _request: Request,
  context: { params: Promise<{ fileName: string }> },
) {
  const { fileName } = await context.params;
  const response = await apiRequest(
    `/platform/logs/${encodeURIComponent(fileName)}/download`,
  );
  return proxyApiFileResponse(response);
}
