import {
  apiRequest,
  proxyApiJsonResponse,
  proxyUnreachableResponse,
} from "@/lib/server-api";

type Context = { params: Promise<{ path?: string[] }> };

/**
 * Thin proxy to the API's tenant control plane.
 *
 * It forwards and nothing else. Every authorization decision — platform
 * identity, platform permission, which tenant is addressed, whether a lifecycle
 * transition is legal — is made in `services/api`, because that is the only
 * place a decision cannot be bypassed by calling the API directly.
 *
 * Failures carry the request that caused them. A tenant erasure that comes back
 * as a bare 502 with no path and no reference is indistinguishable from any
 * other outage, and erasure is precisely the operation where the operator needs
 * to know whether it ran.
 */
async function forward(request: Request, context: Context, method: string) {
  const { path = [] } = await context.params;
  const url = new URL(request.url);
  const target = `/platform/tenants${path.length ? `/${path.map(encodeURIComponent).join("/")}` : ""}${url.search}`;

  try {
    const response = await apiRequest(target, {
      method,
      ...(method === "GET"
        ? {}
        : {
            body: await request.text(),
            headers: { "Content-Type": "application/json" },
          }),
    });
    return proxyApiJsonResponse(response, { path: target, method });
  } catch (error) {
    return proxyUnreachableResponse(error, { path: target, method });
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
