import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

type RouteContext = {
  params: Promise<{ employeeId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { employeeId } = await context.params;
  const formData = await request.formData();

  try {
    const response = await apiRequest(`/employees/${employeeId}/documents/upload`, {
      method: "POST",
      body: formData,
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to upload employee document.");
  }
}
