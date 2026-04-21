import { NextResponse } from "next/server";
import { apiRequest, proxyApiFileResponse, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ employeeId: string; documentId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { employeeId, documentId } = await context.params;
  const response = await apiRequest(
    `/employees/${employeeId}/documents/${documentId}/download`,
    { method: "GET" },
  );

  return proxyApiFileResponse(response);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { employeeId, documentId } = await context.params;

  try {
    const response = await apiRequest(
      `/employees/${employeeId}/documents/${documentId}`,
      { method: "DELETE" },
    );

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to delete employee document.",
      },
      { status: 500 },
    );
  }
}
