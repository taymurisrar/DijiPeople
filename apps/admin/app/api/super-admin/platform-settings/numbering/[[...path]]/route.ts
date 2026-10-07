import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

/**
 * Thin proxy for the platform number sequences (ADR-0027).
 *
 * Forwards and nothing else. The API decides: `settings.read` to list,
 * `settings.manage` plus the administrator tier to change, and the
 * raise-only rule on the next number.
 */
const BASE = "/super-admin/platform-settings/numbering";

type Context = { params: Promise<{ path?: string[] }> };

async function target(context: Context) {
  const { path } = await context.params;
  const suffix = (path ?? []).map(encodeURIComponent).join("/");
  return suffix ? `${BASE}/${suffix}` : BASE;
}

async function forward(
  context: Context,
  method: "GET" | "PATCH",
  request?: Request,
) {
  try {
    const body = request ? await request.text() : undefined;
    const response = await apiRequest(await target(context), {
      method,
      ...(body
        ? { body, headers: { "Content-Type": "application/json" } }
        : {}),
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

export async function PATCH(request: Request, context: Context) {
  return forward(context, "PATCH", request);
}
