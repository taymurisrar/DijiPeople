import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{
    onboardingId: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { onboardingId } = await context.params;
  const response = await apiRequest(`/onboarding/${onboardingId}`, {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}
