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
    const contentType = request.headers.get("content-type") ?? "";
    const response = await apiRequest(
      `/contracts${path.length ? `/${path.map(encodeURIComponent).join("/")}` : ""}${url.search}`,
      {
        method,
        ...(method === "GET"
          ? {}
          : contentType.includes("multipart/form-data")
            ? {
                body: await request.arrayBuffer(),
                headers: { "Content-Type": contentType },
              }
            : {
              body: await request.text(),
              headers: { "Content-Type": "application/json" },
            }),
      },
    );
    const type = response.headers.get("content-type") ?? "";
    return type.includes("application/pdf") || type.includes("officedocument")
      ? proxyApiFileResponse(response)
      : proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to reach the contract service.",
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
