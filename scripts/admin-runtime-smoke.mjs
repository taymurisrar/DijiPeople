import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../services/api/.env", import.meta.url)) });

const adminBase = "http://127.0.0.1:3002";
const apiBase = "http://127.0.0.1:4000/api";
const credentials = [
  [process.env.BOOTSTRAP_ADMIN_EMAIL, process.env.BOOTSTRAP_ADMIN_PASSWORD],
  [
    process.env.PLATFORM_SUPER_ADMIN_EMAIL,
    process.env.PLATFORM_SUPER_ADMIN_PASSWORD,
  ],
].filter(([email, password]) => email && password);

let login;
for (const [email, password] of credentials) {
  const response = await fetch(`${adminBase}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, rememberMe: false }),
  });
  if (response.ok) {
    login = { response, payload: await response.json() };
    break;
  }
}
if (!login)
  throw new Error("Local Admin bootstrap credentials did not authenticate.");

const cookie = login.response.headers
  .getSetCookie()
  .map((value) => value.split(";", 1)[0])
  .join("; ");
const results = {
  login: { ok: true },
  lookups: {},
  routes: {},
  stripeHealth: null,
};
const lookupItems = {};
const lookupPaths = [
  "/platform-users/owner-candidates",
  "/partners?pageSize=100",
  "/super-admin/customers?pageSize=100",
  "/super-admin/tenants",
  "/super-admin/leads?pageSize=100",
  "/super-admin/customer-onboarding?pageSize=100",
  "/super-admin/plans",
  "/contracts?pageSize=100",
  "/contract-templates",
  "/super-admin/subscriptions?pageSize=100",
  "/super-admin/promotions/targets?scope=PRICE",
];
for (const path of lookupPaths) {
  const response = await fetch(
    `${adminBase}/api/platform-runtime/lookups?path=${encodeURIComponent(path)}`,
    { headers: { cookie } },
  );
  const payload = await response.json().catch(() => null);
  lookupItems[path] = Array.isArray(payload?.items) ? payload.items : [];
  results.lookups[path] = {
    status: response.status,
    ok: response.ok,
    items: Array.isArray(payload?.items) ? payload.items.length : null,
    message: response.ok ? undefined : payload?.message,
  };
}

const routes = [
  "/settings",
  "/settings/appearance",
  "/settings/email",
  "/settings/monitoring/error-logs",
  "/settings/monitoring/events",
  "/settings/monitoring/integrations",
  "/settings/tenant-provisioning",
  "/settings/integrations/stripe",
  "/templates",
  "/templates/new",
  "/support/cases",
  "/leads",
  "/leads/00000000-0000-0000-0000-000000000000",
  "/customers",
  "/customers/bff67528-a149-46df-9683-54dedf533d5b",
  "/onboarding",
  "/tenants/43857604-73ee-436f-ab5d-74bd01f7c5cb",
  "/partners",
  "/contracts/32254943-aa6a-4fb9-a1bf-9d65f427fa6b",
  "/plans",
  "/promotions",
  "/subscriptions",
  "/invoices",
  "/payments",
  "/favicon.ico",
];
for (const [source, routeBase] of [
  ["/super-admin/leads?pageSize=100", "/leads"],
  ["/super-admin/customer-onboarding?pageSize=100", "/onboarding"],
  ["/partners?pageSize=100", "/partners"],
  ["/super-admin/plans", "/plans"],
]) {
  const id = lookupItems[source]?.[0]?.value;
  if (id) routes.push(`${routeBase}/${id}`);
}
for (const path of routes) {
  const response = await fetch(`${adminBase}${path}`, {
    headers: { cookie },
    redirect: "manual",
  });
  results.routes[path] = {
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get("content-type"),
    location: response.headers.get("location"),
  };
}

const token = login.payload?.cookies?.accessToken
  ? cookie
      .split("; ")
      .find((item) => item.includes("access_token="))
      ?.split("=", 2)[1]
  : null;
if (token) {
  const response = await fetch(
    `${apiBase}/super-admin/billing/test-stripe-connection`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "x-dijipeople-app": "admin",
      },
    },
  );
  const payload = await response.json().catch(() => null);
  results.stripeHealth = {
    status: response.status,
    ok: response.ok,
    mode: payload?.mode,
    accountId: payload?.accountId,
    message: response.ok ? undefined : payload?.message,
  };
}

process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
