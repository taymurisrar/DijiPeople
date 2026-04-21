import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.json(
      { message: "Invitation token is required." },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(
      `${getApiBaseUrl()}/auth/invitation-status?token=${encodeURIComponent(token)}`,
      {
        method: "GET",
        cache: "no-store",
      },
    );

    const raw = await response.text();
    const data = raw ? JSON.parse(raw) : null;
    return NextResponse.json(data ?? {}, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to validate invitation.",
      },
      { status: 502 },
    );
  }
}
