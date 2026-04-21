import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{
    documentId: string;
  }>;
};

export async function DELETE(_: Request, context: RouteContext) {
  const { documentId } = await context.params;

  try {
    const response = await apiRequest(`/documents/${documentId}`, {
      method: "DELETE",
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to delete document." },
      { status: 500 },
    );
  }
}
