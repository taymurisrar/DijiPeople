import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  let response = await apiRequest(`/employee-bank-accounts/${id}`);
  if (response.status !== 403) {
    return proxyApiJsonResponse(response);
  }

  response = await apiRequest("/me/bank-accounts");
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    return NextResponse.json(data ?? { message: response.statusText }, {
      status: response.status,
    });
  }

  const items = Array.isArray(data)
    ? data
    : Array.isArray(data?.items)
      ? data.items
      : [];
  const record = items.find(
    (item: unknown) =>
      item && typeof item === "object" && (item as { id?: unknown }).id === id,
  );
  return record
    ? NextResponse.json(record)
    : NextResponse.json(
        { message: "Employee bank account was not found." },
        { status: 404 },
      );
}

export async function PATCH(request: Request, context: Context) { const { id } = await context.params; return proxyApiJsonResponse(await apiRequest(`/employee-bank-accounts/${id}`, { method: "PATCH", body: await request.text() })); }
