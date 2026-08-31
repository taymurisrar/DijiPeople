import {
  apiRequest,
  proxyApiFileResponse,
  proxyApiJsonResponse,
} from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

/*
 * The browser's door to `/reporting`, and nothing more.
 *
 * Modelled on `app/api/navigation/[...path]/route.ts` deliberately: forward the
 * path, forward the query, forward the body, forward the response. There is no
 * decision here of any kind.
 *
 * That is not tidiness, it is BUG-0041. A proxy that filters, permits or
 * reshapes becomes a second authorization authority, and a second authority
 * that disagrees with the first is a security hole in whichever direction it
 * disagrees. Reporting is the worst place to introduce one: the API composes
 * `reports:READ` (may this person use the workspace) with the row scope of the
 * data's *own* RBAC entity (which employees, which attendance days), and any
 * approximation of that here would be wrong.
 *
 * Every catch goes through `proxyErrorResponse` (ITEM-0035), so the API's
 * status, `errorCode`, `traceId` and `fieldErrors` survive the hop. A report
 * builder that submits an invalid field needs the 400 and the field errors, not
 * a flattened 500 that reads as an outage.
 */

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

type ProxyMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

async function proxyReportingRequest(
  request: Request,
  context: RouteContext,
  method: ProxyMethod,
) {
  const { path = [] } = await context.params;
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const apiPath = `/reporting/${path.join("/")}${query ? `?${query}` : ""}`;

  /*
   * DELETE carries a body on no reporting route — `/reporting/favorites` takes
   * `targetKey` as a query parameter — but reading it unconditionally is still
   * right: a request with no body returns an empty string, and guessing which
   * methods may carry one is how a proxy silently drops a payload the day a
   * route starts accepting one.
   */
  const requestBody = method === "GET" ? "" : await request.text();
  const body = requestBody.trim() ? requestBody : undefined;

  try {
    const response = await apiRequest(apiPath, { method, body });

    /*
     * `GET /reporting/exports/:runId/download` streams a spreadsheet or a PDF.
     * `proxyApiJsonResponse` would try to parse those bytes as JSON, fail, and
     * hand the browser a message object where a file should be — a download
     * that "works" and produces a 60-byte file. `proxyApiFileResponse` forwards
     * the body as bytes and carries the API's own `Content-Disposition`, which
     * is what names the saved file.
     *
     * Note this is still not a decision: it is *how* the response is forwarded,
     * chosen from the route shape, not whether the caller may have it. The API
     * has already decided that, including whether this run belongs to their
     * tenant.
     */
    if (isFileDownload(path)) {
      return proxyApiFileResponse(response);
    }

    return proxyApiJsonResponse(response);
  } catch (error) {
    return proxyErrorResponse(error, "Unable to complete the reporting request.");
  }
}

function isFileDownload(path: readonly string[]): boolean {
  return path[0] === "exports" && path[path.length - 1] === "download";
}

export function GET(request: Request, context: RouteContext) {
  return proxyReportingRequest(request, context, "GET");
}

export function POST(request: Request, context: RouteContext) {
  return proxyReportingRequest(request, context, "POST");
}

export function PATCH(request: Request, context: RouteContext) {
  return proxyReportingRequest(request, context, "PATCH");
}

export function PUT(request: Request, context: RouteContext) {
  return proxyReportingRequest(request, context, "PUT");
}

export function DELETE(request: Request, context: RouteContext) {
  return proxyReportingRequest(request, context, "DELETE");
}
