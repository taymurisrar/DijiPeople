import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(
  request: Request,
  context: { params: Promise<{ employeeId: string }> },
) {
  const { employeeId } = await context.params;
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const response = await apiRequest(
    `/agent/employees/${encodeURIComponent(employeeId)}/summary${
      query ? `?${query}` : ""
    }`,
  );

  return proxyApiJsonResponse(response);
}
