import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function POST(
  _request: Request,
  context: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await context.params;

  try {
    const response = await apiRequest(`/super-admin/tenants/${tenantId}/owner/reset-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to reach the API.",
      },
      { status: 502 },
    );
  }
}
