import { proxyBulkDeleteByIds } from "@/app/api/_lib/bulk-delete";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const response = await apiRequest(`/departments${query ? `?${query}` : ""}`, {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const response = await apiRequest("/departments", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to create department.");
  }
}

export async function DELETE(request: Request) {
  return proxyBulkDeleteByIds(request, {
    apiPath: "/departments",
    entityLabel: "department",
    entityPluralLabel: "departments",
  });
}
