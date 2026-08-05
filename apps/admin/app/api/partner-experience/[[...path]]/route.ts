import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
type Context = { params: Promise<{ path?: string[] }> };
async function forward(request: Request, context: Context, method: string) {
  try {
    const { path = [] } = await context.params;
    const url = new URL(request.url);
    const response = await apiRequest(
      `/partner-experience${path.length ? `/${path.map(encodeURIComponent).join("/")}` : ""}${url.search}`,
      {
        method,
        ...(method === "GET"
          ? {}
          : {
              body: await request.text(),
              headers: { "Content-Type": "application/json" },
            }),
      },
    );
    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Partner workflow is unavailable.",
      },
      { status: 502 },
    );
  }
}
export const GET = (r: Request, c: Context) => forward(r, c, "GET");
export const POST = (r: Request, c: Context) => forward(r, c, "POST");
export const PATCH = (r: Request, c: Context) => forward(r, c, "PATCH");
