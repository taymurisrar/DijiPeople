import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

/**
 * Forwards. Decides nothing.
 *
 * This handler used to reshape the request: it called `/pay-components` a
 * second time, folded the form's flat `component_<id>` values into a
 * `components` array, and derived `basicSalary` from the first component with a
 * non-empty amount when the caller omitted it. The last of those is a payroll
 * rule — what counts as basic salary — decided in a layer with no tests, no
 * audit trail and no server-side validation, over a number that determines what
 * an employee is paid. BUG-0041 / ITEM-0050.
 *
 * The shape translation moved to the compensation runtime spec, which already
 * has the pay components loaded to build the form
 * (`buildCompensationMutationPayload`). The derivation is gone: the form
 * requires `basicSalary` and so does `CreateEmployeeCompensationDto`, so an
 * omission is now a 400 naming the field rather than an invented salary.
 */
export async function GET() {
  const response = await apiRequest("/payroll/compensations", {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}

export async function POST(request: Request) {
  const response = await apiRequest("/payroll/compensations", {
    method: "POST",
    body: await request.text(),
  });

  return proxyApiJsonResponse(response);
}
