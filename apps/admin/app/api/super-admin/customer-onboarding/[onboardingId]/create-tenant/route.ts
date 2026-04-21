import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function POST(
  request: Request,
  context: { params: Promise<{ onboardingId: string }> },
) {
  const { onboardingId } = await context.params;
  const body = await request.text();

  try {
    const response = await apiRequest(
      `/super-admin/customer-onboarding/${onboardingId}/create-tenant`,
      {
        method: "POST",
        body,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to reach the API.",
      },
      { status: 502 },
    );
  }
}
