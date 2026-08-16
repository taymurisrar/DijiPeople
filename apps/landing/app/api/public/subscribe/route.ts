import { NextResponse } from "next/server";
import { getApiBaseUrl } from "../../../../lib/api";
import { forwardedClientHeaders } from "@/lib/forwarded-headers";

export async function POST(request: Request) {
  try {
    const response = await fetch(`${getApiBaseUrl()}/public/subscribe`, {
      method: "POST",
      headers: {
        ...forwardedClientHeaders(request),
        "Content-Type": "application/json",
        "cf-ipcountry": request.headers.get("cf-ipcountry") ?? "",
        "x-vercel-ip-country": request.headers.get("x-vercel-ip-country") ?? "",
        "x-country-code": request.headers.get("x-country-code") ?? "",
      },
      body: JSON.stringify(await request.json()),
      cache: "no-store",
    });

    const payload = await response.text();

    return new NextResponse(payload, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to start checkout.",
      },
      { status: 500 },
    );
  }
}
