import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type Context = { params: Promise<{ path?: string[] }> };
async function forward(request: Request, context: Context) {
  try {
    const { path = [] } = await context.params;
    const response = await apiRequest(
      `/platform-approvals/${path.map(encodeURIComponent).join("/")}`,
      {
        method: "POST",
        body: await request.text(),
        headers: { "Content-Type": "application/json" },
      },
    );
    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to reach the approval service.",
      },
      { status: 502 },
    );
  }
}
export const POST = forward;
