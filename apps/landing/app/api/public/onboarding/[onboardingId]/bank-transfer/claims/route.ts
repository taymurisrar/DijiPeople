import { NextResponse } from "next/server";
import { getApiBaseUrl } from "../../../../../../../lib/api";
import { forwardedClientHeaders } from "@/lib/forwarded-headers";

// Three 5 MB files plus multipart framing. The API enforces the per-file limit
// again at the stream boundary; this only refuses an obviously oversized body
// before it is buffered here.
const MAX_BODY_BYTES = 16 * 1024 * 1024;

/**
 * "I have paid" — a multipart claim with optional evidence, relayed unchanged.
 * The body is never interpreted here: validation, magic-byte checks and the
 * decision that a claim cannot activate anything all live in the API.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ onboardingId: string }> },
) {
  const { onboardingId } = await params;
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json(
      { message: "The upload is too large. Attach files up to 5 MB each." },
      { status: 413 },
    );
  }
  try {
    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        { message: "The upload is too large. Attach files up to 5 MB each." },
        { status: 413 },
      );
    }
    const response = await fetch(
      `${getApiBaseUrl()}/public/onboarding/${encodeURIComponent(onboardingId)}/bank-transfer/claims`,
      {
        method: "POST",
        headers: {
          ...forwardedClientHeaders(request),
          Accept: "application/json",
          "Content-Type":
            request.headers.get("content-type") ?? "multipart/form-data",
        },
        body,
        cache: "no-store",
      },
    );
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "We could not reach the server. Please try again." },
      { status: 502 },
    );
  }
}
