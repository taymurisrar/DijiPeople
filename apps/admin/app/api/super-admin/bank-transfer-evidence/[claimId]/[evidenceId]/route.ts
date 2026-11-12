import { NextResponse } from "next/server";
import { apiRequest } from "@/lib/server-api";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Customer-supplied payment evidence, streamed to a signed-in operator.
 *
 * The bytes are untrusted and unscanned, so they are only ever delivered as a
 * forced download with `nosniff` and a locked-down CSP - never rendered inline.
 * The API owns authorization and audits the view; this forwards the stream.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ claimId: string; evidenceId: string }> },
) {
  const { claimId, evidenceId } = await params;
  if (!UUID.test(claimId) || !UUID.test(evidenceId)) {
    return NextResponse.json({ message: "Not found." }, { status: 404 });
  }
  try {
    const response = await apiRequest(
      `/super-admin/payments/bank-transfers/${claimId}/evidence/${evidenceId}`,
      { method: "GET" },
    );
    if (!response.ok || !response.body) {
      return NextResponse.json(
        { message: "The evidence could not be opened." },
        { status: response.status === 404 ? 404 : 502 },
      );
    }
    return new NextResponse(response.body, {
      status: 200,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="evidence-${evidenceId}"`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "Unable to reach the API." },
      { status: 502 },
    );
  }
}
