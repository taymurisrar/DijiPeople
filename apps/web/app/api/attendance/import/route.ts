import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const response = await apiRequest("/attendance/import", {
      method: "POST",
      body: formData,
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to import attendance.");
  }
}
