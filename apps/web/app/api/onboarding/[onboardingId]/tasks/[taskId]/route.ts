import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

type RouteContext = {
  params: Promise<{
    onboardingId: string;
    taskId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { onboardingId, taskId } = await context.params;
  const body = await request.json();

  try {
    const response = await apiRequest(`/onboarding/${onboardingId}/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to update onboarding task.");
  }
}
