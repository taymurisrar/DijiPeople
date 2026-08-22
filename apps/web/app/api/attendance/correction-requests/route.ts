import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

export async function GET(request: Request) {
  const { search } = new URL(request.url);

  try {
    const response = await apiRequest(`/attendance/correction-requests${search}`, {
      method: "GET",
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to load attendance correction requests.");
  }
}

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const response = await apiRequest("/attendance/correction-requests", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to create attendance correction request.");
  }
}
