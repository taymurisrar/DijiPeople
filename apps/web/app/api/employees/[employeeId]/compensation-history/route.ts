import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ employeeId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { employeeId } = await context.params;
  const response = await apiRequest(
    `/employees/${employeeId}/compensation-history`,
    { method: "GET" },
  );

  return proxyApiJsonResponse(response);
}

export async function POST(request: Request, context: RouteContext) {
  const { employeeId } = await context.params;
  const body = await request.json();

  try {
    const response = await apiRequest(
      `/employees/${employeeId}/compensation-history`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to create compensation history.",
      },
      { status: 500 },
    );
  }
}
