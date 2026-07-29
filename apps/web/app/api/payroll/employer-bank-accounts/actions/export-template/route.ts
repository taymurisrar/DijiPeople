import { apiRequest } from "@/lib/server-api";

export async function GET() {
  const response = await apiRequest(
    "/payroll/employer-bank-accounts/actions/export-template",
  );
  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: {
      "Content-Type":
        response.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition":
        response.headers.get("content-disposition") ??
        'attachment; filename="employer-bank-accounts-template.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
