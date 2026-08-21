import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

/**
 * Ask the API to re-check this customer's payment with Stripe.
 *
 * A thin proxy, like every route handler here: the decision about whether the
 * order may be advanced is the API's, and it is made from what Stripe says
 * rather than from anything this request carries.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ customerId: string }> },
) {
  const { customerId } = await params;

  try {
    const response = await apiRequest(
      `/super-admin/customers/${encodeURIComponent(customerId)}/recheck-payment`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
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
