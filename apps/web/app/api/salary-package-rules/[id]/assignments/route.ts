import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const query = new URL(request.url).search;
  return proxyApiJsonResponse(
    await apiRequest(`/salary-package-rules/${id}/assignments${query}`),
  );
}

