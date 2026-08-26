import { NextResponse } from "next/server";
import { apiRequest } from "@/lib/server-api";

/**
 * Proxy for the app-releases management surface (TASK-0026): the management
 * catalogue, enable/disable, and channel promotion. The API is the authority —
 * it enforces `appDownloads.manage` and audits every change — so this only
 * forwards.
 */
type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function proxy(request: Request, context: RouteContext) {
  const { path = [] } = await context.params;
  const targetPath = `/app-releases/${path.map(encodeURIComponent).join("/")}`;
  const query = new URL(request.url).searchParams.toString();

  const response = await apiRequest(
    query ? `${targetPath}?${query}` : targetPath,
    {
      method: request.method,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : await request.text(),
    },
  );

  const payload = await response.json().catch(() => null);
  return NextResponse.json(payload, { status: response.status });
}

export async function GET(request: Request, context: RouteContext) {
  return proxy(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxy(request, context);
}
