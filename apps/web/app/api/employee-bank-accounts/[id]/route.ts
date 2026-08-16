import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;

  /*
   * BUG-0039, third instance — found by the check written for the first two
   * rather than by the record, which named only the payslips and the
   * bank-accounts-by-employee proxies.
   *
   * This one fetched `/me/bank-accounts` on 403 and returned whichever row's id
   * matched. Because the substitute came from `/me/*` it did not leak another
   * person's data, which is why it read as harmless — but it still answered
   * around an authorization refusal the API had already made, converting a 403
   * into a 200 or a 404 on the proxy's own judgement. The API decides whether
   * this caller may read this account, and it said no.
   *
   * The refusal is forwarded. A screen that wants the caller's own accounts
   * asks `/me/bank-accounts` directly.
   */
  return proxyApiJsonResponse(
    await apiRequest(`/employee-bank-accounts/${id}`),
  );
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(`/employee-bank-accounts/${id}`, {
      method: "PATCH",
      body: await request.text(),
    }),
  );
}
