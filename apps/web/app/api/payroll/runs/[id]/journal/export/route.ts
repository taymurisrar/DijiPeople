import { apiRequest } from "@/lib/server-api";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const response = await apiRequest(`/payroll/runs/${id}/journal/export`, {
    method: "GET",
  });
  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "text/csv",
      "Content-Disposition":
        response.headers.get("content-disposition") ??
        "attachment; filename=\"payroll-journal.csv\"",
    },
  });
}
