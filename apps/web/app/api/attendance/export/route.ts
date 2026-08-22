import { apiRequest, proxyApiFileResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const response = await apiRequest(
      `/attendance/export${url.search ? url.search : ""}`,
      {
        method: "GET",
      },
    );

    return proxyApiFileResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to export attendance.");
  }
}
