import { apiRequest } from "@/lib/server-api";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const response = await apiRequest(`/me/payslips/${encodeURIComponent(id)}/download`);
  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/pdf",
      "Content-Disposition": response.headers.get("content-disposition") ?? `attachment; filename="payslip.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
