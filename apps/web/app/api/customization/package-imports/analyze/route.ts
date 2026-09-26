import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

/*
 * TASK-0033 — the package upload is multipart, which the customization
 * catch-all cannot forward (it reads the body as text). Analysis changes no
 * metadata; it returns the persisted import plan.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const response = await apiRequest("/customization/package-imports/analyze", {
      method: "POST",
      body: formData,
    });
    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to analyze the uploaded package.");
  }
}
