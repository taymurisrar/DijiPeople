import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = { params: Promise<{ organizationId: string }> };

function settingsPath(organizationId: string) {
  return `/tenant-settings/organizations/${encodeURIComponent(organizationId)}/settings`;
}

export async function GET(_request: Request, context: RouteContext) {
  const { organizationId } = await context.params;

  const response = await apiRequest(settingsPath(organizationId), {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { organizationId } = await context.params;
  const body = await request.json();

  try {
    const response = await apiRequest(settingsPath(organizationId), {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to update organization settings.",
      },
      { status: 500 },
    );
  }
}
