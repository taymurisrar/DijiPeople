import { NextResponse } from "next/server";
import { getApiBaseUrl } from "../../../../../../lib/api";
import { forwardedClientHeaders } from "@/lib/forwarded-headers";

/**
 * Is this workspace address free?
 *
 * Advisory only — the API says so itself, and the unique index at submit time
 * is what actually decides. This proxy exists so the wizard can ask while the
 * buyer types, not so anything can be concluded from the answer.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ onboardingId: string }> },
) {
  const { onboardingId } = await params;
  const value = new URL(request.url).searchParams.get("value") ?? "";

  try {
    const response = await fetch(
      `${getApiBaseUrl()}/public/onboarding/${encodeURIComponent(onboardingId)}/workspace-address?value=${encodeURIComponent(value)}`,
      {
        headers: {
          ...forwardedClientHeaders(request),
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );

    const payload = await response.text();
    return new NextResponse(payload, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to check that address.",
      },
      { status: 500 },
    );
  }
}
