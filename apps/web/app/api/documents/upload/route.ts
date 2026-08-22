import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

export async function POST(request: Request) {
  try {
    const response = await apiRequest("/documents/upload", {
      method: "POST",
      body: await request.formData(),
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to upload document.");
  }
}
