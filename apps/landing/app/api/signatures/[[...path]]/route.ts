import { NextResponse } from "next/server";
import { getApiBaseUrl } from "../../../../lib/api";
type Context = { params: Promise<{ path?: string[] }> };
async function forward(request: Request, context: Context, method: string) {
  try {
    const { path = [] } = await context.params;
    const response = await fetch(
      `${getApiBaseUrl()}/public/signatures/${path.map(encodeURIComponent).join("/")}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id":
            request.headers.get("x-request-id") ?? crypto.randomUUID(),
          "User-Agent":
            request.headers.get("user-agent") ??
            "DijiPeople signing experience",
        },
        ...(method === "GET" ? {} : { body: await request.text() }),
        cache: "no-store",
      },
    );
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Signing service is unavailable.",
      },
      { status: 502 },
    );
  }
}
export const GET = (request: Request, context: Context) =>
  forward(request, context, "GET");
export const POST = (request: Request, context: Context) =>
  forward(request, context, "POST");
