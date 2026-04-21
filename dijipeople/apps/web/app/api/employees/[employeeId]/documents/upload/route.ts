import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ employeeId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { employeeId } = await context.params;
  const formData = await request.formData();

  try {
    const response = await apiRequest(`/employees/${employeeId}/documents/upload`, {
      method: "POST",
      body: formData,
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to upload employee document.",
      },
      { status: 500 },
    );
  }
}
