import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

type RouteContext = { params: Promise<{ moduleKey: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { moduleKey } = await context.params;

  try {
    const formData = await request.formData();

    const response = await apiRequest(
      `/data-management/modules/${encodeURIComponent(moduleKey)}/imports/analyse`,
      { method: "POST", body: formData },
    );

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to analyse the uploaded file.");
  }
}
