import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

/**
 * Thin proxy for the record assignment rule routes.
 *
 * Forwards and nothing else. The API declares `settings.read` for reads and the
 * dry run and `settings.manage` for changes; deciding that again here would
 * create a second answer to a question that already has one.
 */
const BASE = "/super-admin/assignment-rules";

type Context = { params: Promise<{ path?: string[] }> };

async function target(context: Context, request: Request) {
  const { path } = await context.params;
  const suffix = (path ?? []).map(encodeURIComponent).join("/");
  const search = new URL(request.url).search;
  return `${suffix ? `${BASE}/${suffix}` : BASE}${search}`;
}

async function forward(
  context: Context,
  request: Request,
  method: "GET" | "POST" | "PATCH" | "DELETE",
) {
  try {
    const body = method === "GET" || method === "DELETE" ? "" : await request.text();
    const response = await apiRequest(await target(context, request), {
      method,
      ...(body ? { body, headers: { "Content-Type": "application/json" } } : {}),
    });
    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to reach the API.",
      },
      { status: 502 },
    );
  }
}

export async function GET(request: Request, context: Context) {
  return forward(context, request, "GET");
}

export async function POST(request: Request, context: Context) {
  return forward(context, request, "POST");
}

export async function PATCH(request: Request, context: Context) {
  return forward(context, request, "PATCH");
}

export async function DELETE(request: Request, context: Context) {
  return forward(context, request, "DELETE");
}
