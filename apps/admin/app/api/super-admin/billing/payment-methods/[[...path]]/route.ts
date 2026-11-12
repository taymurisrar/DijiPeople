import { createSuperAdminProxy } from "@/lib/super-admin-proxy";

/** Payment-method configuration and receiving accounts. */
const proxy = createSuperAdminProxy("/super-admin/billing/payment-methods");
type Context = Parameters<typeof proxy.GET>[1];

export function GET(request: Request, context: Context) {
  return proxy.GET(request, context);
}

export function POST(request: Request, context: Context) {
  return proxy.POST(request, context);
}

export function PATCH(request: Request, context: Context) {
  return proxy.PATCH(request, context);
}
