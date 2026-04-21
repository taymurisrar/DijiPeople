import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{
    templateId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { templateId } = await context.params;
  const body = await request.json();

  try {
    const response = await apiRequest(`/onboarding/templates/${templateId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to update onboarding template." },
      { status: 500 },
    );
  }
}
