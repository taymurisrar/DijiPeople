import { NextResponse } from "next/server";
import { getApiBaseUrl } from "../../../../../../lib/api";
import { forwardedClientHeaders } from "@/lib/forwarded-headers";
import { STRIPE_SESSION_ID_PATTERN } from "@/lib/provisioning-view";

/**
 * Provisioning state for the page the buyer waits on.
 *
 * `no-store` all the way through: this is polled, and a cached "still
 * provisioning" would leave a finished workspace looking stuck — the one
 * failure this page exists to avoid.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ onboardingId: string }> },
) {
  const { onboardingId } = await params;

  /*
   * Only `session_id` is passed through, and only when it is shaped like a
   * Stripe Checkout Session id. It lets the API ask Stripe about this order
   * on the poll instead of waiting for the webhook; the API cross-checks it
   * against the order's own session and decides nothing on it alone.
   */
  const sessionId = new URL(request.url).searchParams.get("session_id");
  const query =
    sessionId && STRIPE_SESSION_ID_PATTERN.test(sessionId)
      ? `?session_id=${encodeURIComponent(sessionId)}`
      : "";

  try {
    const response = await fetch(
      `${getApiBaseUrl()}/public/onboarding/${encodeURIComponent(onboardingId)}/status${query}`,
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
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to check your workspace.",
      },
      { status: 500 },
    );
  }
}
