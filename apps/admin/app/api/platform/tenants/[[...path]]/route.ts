import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type Context = { params: Promise<{ path?: string[] }> };

/**
 * Thin proxy to the API's tenant control plane.
 *
 * It forwards and nothing else. Every authorization decision — platform
 * identity, platform permission, which tenant is addressed, whether a lifecycle
 * transition is legal — is made in `services/api`, because that is the only
 * place a decision cannot be bypassed by calling the API directly.
 */
async function forward(request: Request, context: Context, method: string) {
  try {
    const { path = [] } = await context.params;
    const url = new URL(request.url);
    const response = await apiRequest(
      `/platform/tenants${path.length ? `/${path.map(encodeURIComponent).join("/")}` : ""}${url.search}`,
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
            : "Unable to reach the tenant control plane.",
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
