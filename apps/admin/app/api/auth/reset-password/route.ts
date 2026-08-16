import { NextResponse } from "next/server";
import { AUTH_APP_CLIENT_ID, getApiBaseUrl } from "@/lib/auth-config";
import { forwardedClientHeaders } from "@/lib/forwarded-headers";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }
  try {
    const response = await fetch(`${getApiBaseUrl()}/admin/auth/reset-password`, {
      method: "POST",
      headers: {
        ...forwardedClientHeaders(request),
        "Content-Type": "application/json",
        "X-DijiPeople-App": AUTH_APP_CLIENT_ID,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const raw = await response.text();
    let data: unknown = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { message: raw || "Unable to reset the password." };
    }
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to reset the password.",
      },
      { status: 502 },
    );
  }
}
