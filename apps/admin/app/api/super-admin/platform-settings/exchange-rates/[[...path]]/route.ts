import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

/**
 * Thin proxy for the platform exchange-rate routes.
 *
 * Forwards and nothing else — no authorization decision is made here. The API
 * governs these paths through the rule that already governs every other
 * platform setting (`settings.read` on a GET, `settings.manage` otherwise), and
 * re-deciding that in a route handler would create a second answer to a
 * question that already has one.
 */
const BASE = "/super-admin/platform-settings/exchange-rates";

type Context = { params: Promise<{ path?: string[] }> };

async function target(context: Context) {
  const { path } = await context.params;
  const suffix = (path ?? []).map(encodeURIComponent).join("/");
  return suffix ? `${BASE}/${suffix}` : BASE;
}

async function forward(
  context: Context,
  method: "GET" | "POST" | "PUT" | "DELETE",
  request?: Request,
) {
  try {
    const body = request ? await request.text() : undefined;
    const response = await apiRequest(await target(context), {
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

export async function GET(_request: Request, context: Context) {
  return forward(context, "GET");
}

export async function POST(_request: Request, context: Context) {
  return forward(context, "POST");
}

export async function PUT(request: Request, context: Context) {
  return forward(context, "PUT", request);
}

export async function DELETE(_request: Request, context: Context) {
  return forward(context, "DELETE");
}
