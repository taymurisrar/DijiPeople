import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const response = await apiRequest(`/onboarding${query ? `?${query}` : ""}`, {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const response = await apiRequest("/onboarding/from-candidate", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to start onboarding.");
  }
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null);
  const response = await apiRequest("/onboarding", {
    method: "DELETE",
    body: body ? JSON.stringify(body) : undefined,
  });

  return proxyApiJsonResponse(response);
}
