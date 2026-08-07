import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = { params: Promise<{ moduleKey: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { moduleKey } = await context.params;

  try {
    const formData = await request.formData();

    const response = await apiRequest(
      `/data-management/modules/${encodeURIComponent(moduleKey)}/imports/analyse`,
      { method: "POST", body: formData },
    );

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to analyse the uploaded file.",
      },
      { status: 500 },
    );
  }
}
