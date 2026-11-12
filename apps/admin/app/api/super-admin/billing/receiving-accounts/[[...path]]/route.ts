import { createSuperAdminProxy } from "@/lib/super-admin-proxy";

/** Receiving-account decisions (approve, reject, suspend, activate). */
const proxy = createSuperAdminProxy("/super-admin/billing/receiving-accounts");
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
