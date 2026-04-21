import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{
    applicationId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { applicationId } = await context.params;
  const body = await request.json();

  try {
    const response = await apiRequest(`/applications/${applicationId}/stage`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to move application stage." },
      { status: 500 },
    );
  }
}
