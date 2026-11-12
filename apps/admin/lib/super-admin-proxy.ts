import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type Method = "GET" | "POST" | "PATCH" | "DELETE";
type Context = { params: Promise<{ path?: string[] }> };

/**
 * A thin proxy for one `/super-admin/...` route family.
 *
 * Forwards and nothing else. The API declares the platform permission for every
 * handler (`payments.read`, `payments.verify`, `platform.billing.administer`),
 * and deciding that again here would create a second answer to a question that
 * already has one. Authentication and token refresh come from `apiRequest`.
 */
export function createSuperAdminProxy(base: string) {
  async function forward(context: Context, request: Request, method: Method) {
    try {
      const { path } = await context.params;
      const suffix = (path ?? []).map(encodeURIComponent).join("/");
      const search = new URL(request.url).search;
      const target = `${suffix ? `${base}/${suffix}` : base}${search}`;
      const body =
        method === "GET" || method === "DELETE" ? "" : await request.text();
      const response = await apiRequest(target, {
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

  return {
    GET: (request: Request, context: Context) =>
      forward(context, request, "GET"),
    POST: (request: Request, context: Context) =>
      forward(context, request, "POST"),
    PATCH: (request: Request, context: Context) =>
      forward(context, request, "PATCH"),
    DELETE: (request: Request, context: Context) =>
      forward(context, request, "DELETE"),
  };
}
