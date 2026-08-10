import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type Context = { params: Promise<{ path?: string[] }> };

async function forward(request: Request, context: Context, method: string) {
  try {
    const { path = [] } = await context.params;
    const url = new URL(request.url);
    const suffix = path.length
      ? `/${path.map(encodeURIComponent).join("/")}`
      : "";
    const response = await apiRequest(
      `/super-admin/platform-email${suffix}${url.search}`,
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
            : "Unable to reach platform email settings.",
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
