import { NextResponse } from "next/server";
import { getApiBaseUrl } from "../../../lib/api";

export async function POST(request: Request) {
  try {
    const response = await fetch(`${getApiBaseUrl()}/public/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
            : "Unable to submit your request.",
      },
      { status: 500 },
    );
  }
}
