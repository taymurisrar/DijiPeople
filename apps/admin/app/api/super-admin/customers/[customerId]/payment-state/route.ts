import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

/**
 * What this customer's payment is doing, so the record page can decide whether
 * to offer the re-check button at all.
 *
 * A thin proxy. The state comes from the same query the POST re-check runs, so
 * the button and the action behind it cannot disagree about whether there is
 * anything to re-check.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ customerId: string }> },
) {
  const { customerId } = await params;

  try {
    const response = await apiRequest(
      `/super-admin/customers/${encodeURIComponent(customerId)}/payment-state`,
    );
    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to reach the API.",
      },
      { status: 502 },
    );
  }
}
