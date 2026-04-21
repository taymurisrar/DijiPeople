import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/activate-account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const raw = await response.text();
    const data = raw ? JSON.parse(raw) : null;
    return NextResponse.json(data ?? {}, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to activate account.",
      },
      { status: 502 },
    );
  }
}
