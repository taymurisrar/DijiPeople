import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
type Context = { params: Promise<{ path: string[] }> };
const target = (path: string[], request: Request) =>
  `/loan-policies/${path.join("/")}${new URL(request.url).search}`;
export async function GET(request: Request, context: Context) {
  const { path } = await context.params;
  return proxyApiJsonResponse(await apiRequest(target(path, request)));
}
export async function POST(request: Request, context: Context) {
  const { path } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(target(path, request), {
      method: "POST",
      body: await request.text(),
    }),
  );
}
export async function PATCH(request: Request, context: Context) {
  const { path } = await context.params;
  return proxyApiJsonResponse(
    await apiRequest(target(path, request), {
      method: "PATCH",
      body: await request.text(),
    }),
  );
}
