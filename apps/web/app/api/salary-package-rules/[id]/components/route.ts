import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyApiJsonResponse(
    await apiRequest(`/salary-package-rules/${id}/components`),
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyApiJsonResponse(
    await apiRequest(`/salary-package-rules/${id}/components`, {
      method: "POST",
      body: await request.text(),
    }),
  );
}

