import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type Context = { params: Promise<{ path: string[] }> };
const target = (path: string[], request: Request) =>
  `/payroll/operations/${path.map(encodeURIComponent).join("/")}${new URL(request.url).search}`;

export async function GET(request: Request, context: Context) {
  const { path } = await context.params;
  const response = await apiRequest(target(path, request));
  return proxyOperationResponse(response);
}

async function proxyOperationResponse(response: Response) {
  const disposition = response.headers.get("content-disposition");
  if (!disposition) return proxyApiJsonResponse(response);
  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: {
      "Content-Type":
        response.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": disposition,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function POST(request: Request, context: Context) {
  const { path } = await context.params;
  return proxyOperationResponse(
    await apiRequest(target(path, request), { method: "POST" }),
  );
}
