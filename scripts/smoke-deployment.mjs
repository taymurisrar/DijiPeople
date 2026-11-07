#!/usr/bin/env node

const apiBaseUrl = (
  process.env.SMOKE_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.API_BASE_URL ||
  "http://127.0.0.1:4000/api"
).replace(/\/$/, "");

const email = process.env.SMOKE_LOGIN_EMAIL || process.env.BOOTSTRAP_ADMIN_EMAIL;
const password =
  process.env.SMOKE_LOGIN_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD;
import { loginBody } from "./smoke-login.mjs";

/*
 * DP-QA-048 - `POST /auth/login` refuses a request with no tenant context
 * (`AUTH_UNAUTHORIZED`, "Company or tenant context is required to sign in."): the
 * API resolves the workspace from `tenantSlug` in the body and does not read the
 * Origin header for sign-in. The smoke logins used to send only email and
 * password, so every one of them failed against a tenant user, including the
 * Starter behavioural proof that was added to catch a guard that misbehaves while
 * /api/health says "enforced".
 *
 *   SMOKE_TENANT_SLUG          workspace of the SMOKE_LOGIN_* user
 *   SMOKE_STARTER_TENANT_SLUG  workspace of the SMOKE_STARTER_LOGIN_* user
 *                              (defaults to SMOKE_TENANT_SLUG)
 */
const tenantSlug = (process.env.SMOKE_TENANT_SLUG || "").trim().toLowerCase();
const starterTenantSlug = (
  process.env.SMOKE_STARTER_TENANT_SLUG || tenantSlug
)
  .trim()
  .toLowerCase();

const origin =
  process.env.SMOKE_ORIGIN ||
  process.env.NEXT_PUBLIC_WEB_URL ||
  process.env.WEB_APP_URL ||
  "http://localhost:3001";

const failures = [];

async function check(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`not ok - ${name}: ${error.message}`);
  }
}

async function request(path, init = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  return response;
}

function collectCookies(response) {
  const setCookie = response.headers.get("set-cookie");
  return setCookie
    ? setCookie
        .split(/,(?=\s*[^;]+?=)/)
        .map((item) => item.split(";")[0])
        .join("; ")
    : "";
}

await check("API health endpoint", async () => {
  const response = await request("/");
  if (!response.ok) throw new Error(`Expected 2xx, got ${response.status}`);
});

/*
 * ITEM-0010 — report which commit answered, so this suite can say what it
 * smoke-tested rather than only that something answered.
 *
 * Deliberately not a failure when the commit is unknown: a deployment given no
 * commit variable is misconfigured for release *reporting*, not unhealthy, and
 * failing the run would conflate the two. It is printed loudly instead, because
 * a release record reading "unknown" is a prompt to fix the deploy config.
 */
await check("API reports the commit it is serving", async () => {
  const response = await request("/health");
  if (!response.ok) throw new Error(`Expected 2xx, got ${response.status}`);

  const payload = await response.json().catch(() => null);
  const commit = payload?.commit ?? "unknown";

  if (commit === "unknown") {
    console.log(
      "    ! commit: unknown — set GIT_COMMIT_SHA (or deploy on a platform " +
        "that injects one) so release records can observe the deployed SHA " +
        "rather than assert it.",
    );
  } else {
    console.log(`    commit: ${payload?.commitShort ?? commit}`);
  }
});

/*
 * BUG-0904 — production ran with no outbox worker, so a customer could pay and
 * no workspace was ever built.
 *
 * `render.yaml` declares `OUTBOX_WORKER_ENABLED: "true"` and always did; the
 * live service was configured by hand and the file was never applied, the same
 * drift as BUG-0767. Nothing could detect it. The worker announces itself in a
 * startup log that scrolls away, and the API answered `status: ok` either way,
 * so the only symptom was `PROVISIONING_REQUESTED` rows quietly accumulating.
 *
 * This is the only durable guard available for that class: the value lives on
 * the service, not in this repository, so no unit test can reach it. A smoke
 * check can.
 *
 * A hard failure rather than a warning. "Exactly one deployed service should
 * have it true" means the service this suite points at is that service — if it
 * is not, nothing is draining the outbox and the deployment cannot complete a
 * paid signup.
 */
await check("outbox worker is draining events", async () => {
  const response = await request("/health");
  if (!response.ok) throw new Error(`Expected 2xx, got ${response.status}`);

  const payload = await response.json().catch(() => null);
  const enabled = payload?.outboxWorker?.enabled;

  if (enabled === undefined) {
    throw new Error(
      "health does not report outboxWorker.enabled, so whether the worker " +
        "runs cannot be observed. Either the deployment predates the BUG-0904 " +
        "fix, or it carries the first version of it — which added the field to " +
        "AppService while `/api/health` is answered by an express handler in " +
        "main.ts that bypasses the Nest controller entirely. Check main.ts " +
        "before concluding the deployment is simply old.",
    );
  }
  if (enabled !== true) {
    throw new Error(
      'OUTBOX_WORKER_ENABLED is not "true" on this service. Provisioning is an ' +
        "outbox consumer, so a customer can pay and no workspace is built. See " +
        "BUG-0904.",
    );
  }
});

/*
 * DP-QA-005 - production defaulted to REPORT_ONLY, so a Starter tenant could use
 * every paid module and nothing but a log line said so.
 *
 * Read from the RUNNING process (/api/health), because the setting lives on the
 * service. A hard failure, and a hard failure when the field is absent too: a
 * deployment that cannot say whether it enforces entitlements is treated as one
 * that does not. SMOKE_ALLOW_UNENFORCED=1 is the explicit, printed exception for
 * a release that knowingly precedes the cutover.
 */
await check("plan entitlements are enforced, not merely logged", async () => {
  const response = await request("/health");
  if (!response.ok) throw new Error(`Expected 2xx, got ${response.status}`);
  const payload = await response.json().catch(() => null);
  const state = payload?.entitlementEnforcement;

  if (!state || typeof state.enforced !== "boolean") {
    throw new Error(
      "health does not report entitlementEnforcement, so enforcement cannot be " +
        "confirmed. The deployment predates DP-QA-005 or /api/health is not " +
        "answered by the current build (see the express handler in main.ts).",
    );
  }
  if (state.enforced !== true) {
    if (process.env.SMOKE_ALLOW_UNENFORCED === "1") {
      console.warn(
        `    ! entitlement enforcement is ${state.mode}; allowed by SMOKE_ALLOW_UNENFORCED=1`,
      );
      return;
    }
    throw new Error(
      `entitlement enforcement is ${state.mode}: unauthorised modules are served. ` +
        "Set ENTITLEMENT_ENFORCEMENT_MODE=ENFORCE on the API service (DP-QA-005, ADR-0009).",
    );
  }
  /*
   * DP-QA-052 - enforcement can be true while the DATABASE setting says something
   * weaker: the release floor (the environment variable) is then the only thing
   * holding it up, and removing the variable would silently withdraw enforcement.
   * Visible here as source ENV; a warning by default, a failure when asked.
   */
  if (state.source === "ENV" && state.stored && state.stored !== "ENFORCE") {
    const message =
      "enforcement is held up by the " + state.floor + " release floor while the stored " +
      "setting is " + state.stored + ": set the stored setting too (npm run entitlement:set-mode -- ENFORCE).";
    if (process.env.SMOKE_FAIL_ON_ENTITLEMENT_DRIFT === "1") throw new Error(message);
    console.warn("    ! " + message);
  }
});

/*
 * Behavioural proof with a DEDICATED SYNTHETIC Starter-plan tenant account. The
 * health flag says what the service believes; this proves what it does, as a real
 * tenant user would meet it: sign in, stay signed in, reach what the plan includes,
 * be refused what it does not, and be signed out for real.
 *
 * Never a customer's account, never the owner's: SMOKE_STARTER_LOGIN_* names a
 * test user created for this purpose in a Starter-plan test workspace
 * (SMOKE_STARTER_TENANT_SLUG), with no MFA requirement of its own, linked to an
 * EMPLOYEE record (attendance and leave self-service answer 400 for a user with
 * no employee profile, such as a workspace owner who is not also an employee). If the account
 * demands MFA the check fails and says so; it does not try to answer a challenge.
 * SMOKE_REQUIRE_STARTER_PROBE=1 turns a missing account into a failure, which is
 * the setting for a production verification.
 */
const starterEmail = process.env.SMOKE_STARTER_LOGIN_EMAIL;
const starterPassword = process.env.SMOKE_STARTER_LOGIN_PASSWORD;

/** Signs a TENANT user in. Returns the cookie header, or throws a message that never contains a token or a challenge. */
async function tenantSignIn(credentials, slug) {
  const login = await request("/auth/login", {
    method: "POST",
    body: loginBody(credentials, slug, { rememberMe: false }),
  });
  const body = await login.json().catch(() => null);
  if (body && body.mfaRequired) {
    throw new Error(
      "the account requires MFA, which a smoke test must not answer: use a synthetic test account without it.",
    );
  }
  if (!login.ok) throw new Error(`tenant sign-in: expected 2xx, got ${login.status}`);
  const cookie = collectCookies(login);
  if (!cookie) throw new Error("tenant sign-in returned no session cookies.");
  return cookie;
}

if (starterEmail && starterPassword) {
  let starterCookie = "";
  await check("a Starter tenant user signs in with its tenant context", async () => {
    starterCookie = await tenantSignIn(
      { email: starterEmail, password: starterPassword },
      starterTenantSlug,
    );
  });
  if (starterCookie) {
    await check("the Starter session is live and belongs to the expected workspace", async () => {
      const me = await request("/auth/me", { headers: { Cookie: starterCookie } });
      if (!me.ok) throw new Error(`/auth/me: expected 2xx, got ${me.status}`);
      const body = await me.json().catch(() => null);
      const slug = String(body?.tenant?.slug ?? body?.user?.tenantSlug ?? "").toLowerCase();
      if (slug && slug !== starterTenantSlug) {
        throw new Error(`signed in to workspace "${slug}", expected "${starterTenantSlug}".`);
      }
    });
    for (const [label, path] of [
      ["employee access", "/employees?pageSize=1"],
      ["leave", "/leave-requests/mine"],
      ["attendance", "/attendance/mine/today"],
      ["document access", "/documents?pageSize=1"],
    ]) {
      await check(`a Starter tenant reaches what its plan includes: ${label}`, async () => {
        const response = await request(path, { headers: { Cookie: starterCookie } });
        if (!response.ok) throw new Error(`GET ${path}: expected 2xx, got ${response.status}`);
      });
    }
    for (const [label, path] of [
      ["recruitment", "/job-openings"],
      ["payroll", "/payroll/runs"],
      ["timesheets", "/timesheets/entries"],
      ["projects", "/projects"],
    ]) {
      await check(`a Starter tenant is refused a module its plan does not include: ${label}`, async () => {
        const denied = await request(path, { headers: { Cookie: starterCookie } });
        if (denied.status !== 403) {
          throw new Error(
            `GET ${path} as a Starter tenant returned ${denied.status}, expected 403 ENTITLEMENT refusal.`,
          );
        }
      });
    }
    await check("signing out ends the Starter session for real", async () => {
      const out = await request("/auth/logout", { method: "POST", headers: { Cookie: starterCookie } });
      if (!out.ok) throw new Error(`logout: expected 2xx, got ${out.status}`);
      const after = await request("/auth/me", { headers: { Cookie: starterCookie } });
      if (![401, 403].includes(after.status)) {
        throw new Error(`/auth/me after logout: expected 401/403, got ${after.status}`);
      }
    });
  }
} else if (process.env.SMOKE_REQUIRE_STARTER_PROBE === "1") {
  await check("a dedicated synthetic Starter test account is configured", async () => {
    throw new Error(
      "SMOKE_REQUIRE_STARTER_PROBE=1 but SMOKE_STARTER_LOGIN_EMAIL / SMOKE_STARTER_LOGIN_PASSWORD / SMOKE_STARTER_TENANT_SLUG are not all set. " +
        "A production verification needs a synthetic Starter account; it must not use a customer or owner account.",
    );
  });
} else {
  console.warn(
    "Skipping the Starter tenant journey. Set SMOKE_STARTER_LOGIN_EMAIL, SMOKE_STARTER_LOGIN_PASSWORD and SMOKE_STARTER_TENANT_SLUG (a synthetic Starter-plan test user).",
  );
}

/*
 * Platform administration is a SEPARATE identity system (POST /admin/auth/login,
 * app client "admin"): a platform admin does not open a tenant workspace and a
 * tenant owner does not open the console. Checked on its own, with its own
 * variables, so a missing tenant context can never be mistaken for a broken
 * platform login or the other way round. Optional.
 */
const platformEmail = process.env.SMOKE_PLATFORM_EMAIL;
const platformPassword = process.env.SMOKE_PLATFORM_PASSWORD;
if (platformEmail && platformPassword) {
  await check("platform admin signs in through the platform identity system", async () => {
    const response = await request("/admin/auth/login", {
      method: "POST",
      headers: { "X-DijiPeople-App": "admin" },
      body: JSON.stringify({ email: platformEmail, password: platformPassword }),
    });
    const body = await response.json().catch(() => null);
    if (body && body.mfaRequired) {
      throw new Error("the platform account requires MFA, which a smoke test must not answer.");
    }
    if (!response.ok) throw new Error(`platform sign-in: expected 2xx, got ${response.status}`);
  });
} else {
  console.warn("Skipping the platform sign-in check. Set SMOKE_PLATFORM_EMAIL and SMOKE_PLATFORM_PASSWORD (a platform service account).");
}

await check("protected profile rejects unauthenticated request", async () => {
  const response = await request("/auth/me");
  if (![401, 403].includes(response.status)) {
    throw new Error(`Expected 401/403, got ${response.status}`);
  }
});

let cookieHeader = "";
if (email && password) {
  await check("auth login works", async () => {
    const response = await request("/auth/login", {
      method: "POST",
      body: loginBody({ email, password }, tenantSlug, { rememberMe: true }),
    });
    if (!response.ok) throw new Error(`Expected 2xx, got ${response.status}`);
    cookieHeader = collectCookies(response);
    if (!cookieHeader) throw new Error("Login did not return auth cookies.");
  });

  await check("authenticated profile works", async () => {
    const response = await request("/auth/me", {
      headers: { Cookie: cookieHeader },
    });
    if (!response.ok) throw new Error(`Expected 2xx, got ${response.status}`);
  });

  for (const path of ["/employees", "/leave-types", "/pay-components", "/claims/types"]) {
    await check(`major module list endpoint ${path}`, async () => {
      const response = await request(path, { headers: { Cookie: cookieHeader } });
      if (!response.ok) throw new Error(`Expected 2xx, got ${response.status}`);
    });
  }
} else {
  console.warn(
    "Skipping authenticated smoke checks. Set SMOKE_LOGIN_EMAIL and SMOKE_LOGIN_PASSWORD.",
  );
}

await check("CORS origin is accepted", async () => {
  const response = await request("/");
  const allowOrigin = response.headers.get("access-control-allow-origin");
  if (allowOrigin && allowOrigin !== origin && allowOrigin !== "*") {
    throw new Error(`Unexpected CORS origin: ${allowOrigin}`);
  }
});

/*
 * Can this deployment actually sell anything, and record that it did?
 *
 * ITEM-0086. Everything above proves the service is *up*. None of it proves the
 * product can be bought, and on 2026-08-23 a QA run found production had been
 * unable to take a single order for as long as anyone could measure — with every
 * existing check green, because "up" and "sellable" are different questions.
 *
 * Two causes, each invisible to a health check and each caught here:
 *
 *   BUG-0898  0 of 36 plan prices had ever been synced to Stripe, so every plan
 *             rendered "not available to buy online" and no form at all.
 *   BUG-0906  no legal document had ever been published, so a purchase could
 *             record no consent.
 *
 * A third, BUG-0904 — the outbox worker being off, so a paid customer never
 * receives a workspace — is not observable from outside and is deliberately not
 * asserted here rather than faked.
 *
 * These read only public endpoints, so they run against any deployment without a
 * session. That matters: the failure they describe is one a prospective customer
 * hits before they ever authenticate.
 */
await check("a launched market has at least one purchasable plan", async () => {
  const response = await request("/public/plans");
  if (!response.ok) throw new Error(`/public/plans returned ${response.status}`);

  const payload = await response.json();
  const plans = Array.isArray(payload) ? payload : (payload.plans ?? []);
  if (!plans.length) throw new Error("no public plans are published at all");

  const prices = plans.flatMap((plan) => plan.prices ?? []);
  const sellable = prices.filter(
    (price) => price.checkoutReady ?? price.isCheckoutReady,
  );

  if (!sellable.length) {
    /*
     * The reasons are already on the price — surfaced rather than summarised,
     * because "Stripe Price ID is missing" names the operator step that was
     * skipped and "not sellable" does not.
     */
    const reasons = [
      ...new Set(prices.flatMap((price) => price.checkoutReadinessReasons ?? [])),
    ].slice(0, 4);
    throw new Error(
      `0 of ${prices.length} active price(s) are checkout-ready — nobody can buy. ` +
        (reasons.length ? `Reasons: ${reasons.join(" ")} ` : "") +
        "Run `npm run report:commercial` for the full picture.",
    );
  }
});

await check("legal documents are published", async () => {
  const response = await request("/public/legal");
  if (!response.ok) throw new Error(`/public/legal returned ${response.status}`);

  const payload = await response.json();
  const documents = Array.isArray(payload?.documents) ? payload.documents : [];

  if (!documents.length) {
    throw new Error(
      "no legal document is published, so a purchase records no consent — run " +
        "`npm --workspace api run legal:publish -- --confirm` and read its " +
        "reasons if it refuses",
    );
  }

  /*
   * A document that cannot name the version accepted is not evidence. The
   * subscribe wizard filters on exactly this, so a published document carrying
   * no versionId is offered to nobody and is worth the same as none.
   */
  const unusable = documents.filter((document) => !document.versionId);
  if (unusable.length) {
    throw new Error(
      `${unusable.length} published document(s) carry no versionId, so no ` +
        `acceptance can name them: ${unusable.map((d) => d.slug).join(", ")}`,
    );
  }
});

/*
 * BUG-0989 — a Stripe webhook secret that does not match its endpoint rejects
 * every delivery, and the platform never learns that a customer paid.
 *
 * This check cannot prove the secret is *correct*, and nothing on this side
 * can: a request carrying a deliberately-invalid signature is rejected whether
 * the configured secret matches the endpoint or not. That is exactly why the
 * probe used to diagnose BUG-0989 could exonerate the code and could not
 * confirm the fix. Only Stripe, replaying a genuinely signed delivery, answers
 * that question.
 *
 * What it can prove is that a secret is configured at all — the cheaper half of
 * the same failure, and the half that produces an identical symptom. When it is
 * missing, the message names the one action that finishes the diagnosis,
 * because a check that reports a problem it cannot fully settle should say who
 * can.
 *
 * Skipped rather than failed when the variable is absent from *this* process:
 * the suite is run both from a developer machine, which has no production
 * environment, and from the deployment itself, which does.
 */
await check("Stripe webhook secret is configured", async () => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (secret === undefined && !process.env.SMOKE_REQUIRE_STRIPE_WEBHOOK_SECRET) {
    console.log(
      "    skipped — STRIPE_WEBHOOK_SECRET is not in this process's " +
        "environment; set SMOKE_REQUIRE_STRIPE_WEBHOOK_SECRET=1 to require it",
    );
    return;
  }

  if (!secret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET is unset, so every Stripe delivery is rejected " +
        "with 400 and no payment reaches the platform. Set it to the signing " +
        "secret of the endpoint delivering to this service, then confirm with " +
        "Stripe -> Developers -> Webhooks -> Recent deliveries -> Resend, " +
        "which must return 200.",
    );
  }

  if (!secret.startsWith("whsec_")) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET does not look like a Stripe signing secret — " +
        "expected a whsec_ prefix. An API or publishable key here fails every " +
        "signature check while looking configured.",
    );
  }
});

/*
 * The composed tenant workspace host must actually resolve (ITEM-0103).
 *
 * BUG-1644 shipped a bundle that sent every customer to
 * `<slug>.dijipeople.com`, which has no DNS record. The first thing to notice
 * was a paying customer who could not log in.
 *
 * No test in this repository can catch that class of defect, and it is worth
 * being exact about why: `NEXT_PUBLIC_*` values are inlined at build time, so
 * the project settings can be right while the running bundle serves a stale
 * value, and the two are indistinguishable from a browser. The value under test
 * is not in the repository. Only something that inspects a deployed artifact
 * can see it — which is what this script already is.
 *
 * Skipped rather than failed when there is no slug to compose with: a smoke run
 * against a target with no tenants is a real situation, and inventing a slug
 * would test DNS for a workspace nobody has.
 */
await check("the composed tenant workspace host resolves", async () => {
  const slug = process.env.SMOKE_TENANT_SLUG;
  const root =
    process.env.SMOKE_TENANT_ROOT_DOMAIN ||
    process.env.TENANT_BASE_DOMAIN ||
    process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN ||
    process.env.NEXT_PUBLIC_TENANT_ROOT_DOMAIN;

  if (!slug || !root) {
    console.log(
      "    skipped — set SMOKE_TENANT_SLUG and a tenant root domain " +
        "(SMOKE_TENANT_ROOT_DOMAIN, TENANT_BASE_DOMAIN or " +
        "NEXT_PUBLIC_TENANT_BASE_DOMAIN) to check workspace routing",
    );
    return;
  }

  // Composed the way `buildTenantPortalUrl` composes it, deliberately: a check
  // that builds the host its own way would pass while the frontend's version
  // was broken, which is the failure it exists to catch.
  const host = `${String(slug).trim().toLowerCase()}.${String(root).trim().toLowerCase().replace(/^\.+|\.+$/g, "")}`;
  const url = `https://${host}/login`;

  let response;
  try {
    response = await fetch(url, { redirect: "follow" });
  } catch (error) {
    throw new Error(
      `${url} could not be reached (${error.message}). The workspace host the ` +
        `frontend composes does not resolve, so every customer sent there sees ` +
        `a browser error rather than a login page.`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `${url} answered ${response.status}. The host resolves but does not serve ` +
        `the workspace login, so the composed address and the address ` +
        `workspaces are actually served from disagree.`,
    );
  }

  /*
   * Resolving is necessary and not sufficient. A wildcard that answers the
   * generic login would satisfy a status check while sending the customer to a
   * page asking for the company code they should never have been asked for —
   * so the body is checked for that step, which is what "the two roots are
   * individually valid but disagree" looks like from outside.
   */
  const body = await response.text();
  if (/company\s*code|tenant\s*code|workspace\s*code/i.test(body)) {
    throw new Error(
      `${url} resolves but presents the company-code step, so it is not being ` +
        `served as a tenant workspace. The bundle's root domain and the domain ` +
        `workspaces are served from are both valid and do not agree.`,
    );
  }
});

if (failures.length) {
  console.error(`Smoke checks failed: ${failures.length}`);
  process.exit(1);
}

console.log("Deployment smoke checks completed successfully.");
