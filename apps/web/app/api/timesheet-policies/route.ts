import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.toString();
  const response = await apiRequest(
    `/timesheet-policies${query ? `?${query}` : ""}`,
  );
  return proxyApiJsonResponse(response);
}

export async function POST(request: Request) {
  try {
    const response = await apiRequest("/timesheet-policies", {
      method: "POST",
      body: JSON.stringify(await request.json()),
    });
    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to create timesheet policy.");
  }
}
