import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

type RouteContext = {
  params: Promise<{
    onboardingId: string;
  }>;
};

export async function POST(_: Request, context: RouteContext) {
  const { onboardingId } = await context.params;

  try {
    const response = await apiRequest(
      `/onboarding/${onboardingId}/convert-to-employee`,
      {
        method: "POST",
      },
    );

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to convert onboarding to employee.");
  }
}
