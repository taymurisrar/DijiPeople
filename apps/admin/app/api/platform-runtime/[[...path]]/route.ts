import { NextResponse } from "next/server";
import {
  apiRequest,
  proxyApiFileResponse,
  proxyApiJsonResponse,
} from "@/lib/server-api";

type Context = { params: Promise<{ path?: string[] }> };

async function forward(request: Request, context: Context, method: string) {
  try {
    const { path = [] } = await context.params;
    const url = new URL(request.url);
    const response = await apiRequest(
      `/platform-runtime${path.length ? `/${path.map(encodeURIComponent).join("/")}` : ""}${url.search}`,
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

    return response.headers.get("content-type")?.includes("text/csv")
      ? proxyApiFileResponse(response)
      : proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to reach the platform runtime service.",
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
