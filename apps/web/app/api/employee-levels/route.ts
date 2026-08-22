import { proxyBulkDeleteByIds } from "@/app/api/_lib/bulk-delete";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = new URLSearchParams(url.searchParams);

  if (!params.has("isActive") && !params.has("includeInactive")) {
    params.set("isActive", "true");
  }

  params.delete("includeInactive");
  const query = params.toString();
  const response = await apiRequest(
    `/employee-levels${query ? `?${query}` : ""}`,
    { method: "GET" },
  );

  return proxyApiJsonResponse(response);
}

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const response = await apiRequest("/employee-levels", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to create employee level.");
  }
}

export async function DELETE(request: Request) {
  return proxyBulkDeleteByIds(request, {
    apiPath: "/employee-levels",
    entityLabel: "employee level",
    entityPluralLabel: "employee levels",
  });
}
