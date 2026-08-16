import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ employeeId: string }> },
) {
  const { employeeId } = await params;

  /*
   * BUG-0039. Identical to the payslips proxy: a 403 was converted into a 200
   * carrying the caller's *own* bank accounts under a URL naming a different
   * employee. Bank details are among the most sensitive fields in the product,
   * and the substitution was silent.
   *
   * The 403 is forwarded. See `apps/web/AGENTS.md` — a proxy makes no
   * authorization decisions.
   */
  const response = await apiRequest(`/employees/${employeeId}/bank-accounts`);
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || typeof data !== "object") {
    return NextResponse.json(data ?? { message: response.statusText }, {
      status: response.status,
    });
  }
  return NextResponse.json(normalizeBankAccountList(data), {
    status: response.status,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ employeeId: string }> },
) {
  const { employeeId } = await params;
  return proxyApiJsonResponse(
    await apiRequest(`/employees/${employeeId}/bank-accounts`, {
      method: "POST",
      body: await request.text(),
    }),
  );
}

function normalizeBankAccountList(data: unknown) {
  if (!data || typeof data !== "object") return data;
  const response = data as { items?: unknown };
  if (!Array.isArray(response.items)) return data;
  return {
    ...response,
    items: response.items.map((item) => {
      if (!item || typeof item !== "object") return item;
      const row = item as Record<string, unknown>;
      const bank = row.bank;
      return {
        ...row,
        bankName:
          typeof row.bankName === "string"
            ? row.bankName
            : bank && typeof bank === "object" && "name" in bank
              ? String((bank as { name?: unknown }).name ?? "")
              : "",
      };
    }),
  };
}
