import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type Context = { params: Promise<{ path?: string[] }> };

/*
 * A thin proxy. The API owns every authorization decision; this only carries
 * the session cookie and the app header across (see server-api.ts).
 */
async function forward(request: Request, context: Context, method: string) {
  try {
    const { path = [] } = await context.params;
    const url = new URL(request.url);
    const response = await apiRequest(
      `/platform-teams${path.length ? `/${path.map(encodeURIComponent).join("/")}` : ""}${url.search}`,
      {
        method,
        ...(method === "GET" || method === "DELETE"
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
          error instanceof Error ? error.message : "Unable to reach teams.",
      },
      { status: 502 },
    );
  }
}

export const GET = (request: Request, context: Context) =>
  forward(request, context, "GET");
export const POST = (request: Request, context: Context) =>
  forward(request, context, "POST");
export const PATCH = (request: Request, context: Context) =>
  forward(request, context, "PATCH");
export const DELETE = (request: Request, context: Context) =>
  forward(request, context, "DELETE");
