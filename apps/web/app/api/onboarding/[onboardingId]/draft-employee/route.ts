import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{
    onboardingId: string;
  }>;
};

export async function POST(_: Request, context: RouteContext) {
  const { onboardingId } = await context.params;

  try {
    const response = await apiRequest(`/onboarding/${onboardingId}/draft-employee`, {
      method: "POST",
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to prepare employee draft.",
      },
      { status: 500 },
    );
  }
}
