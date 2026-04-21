import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{
    candidateId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { candidateId } = await context.params;
  const body = await request.json();

  try {
    const response = await apiRequest(`/candidates/${candidateId}/documents`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to register candidate document metadata.",
      },
      { status: 500 },
    );
  }
}
