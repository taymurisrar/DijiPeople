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
      "health does not report outboxWorker.enabled — the deployment predates " +
        "the BUG-0904 fix, so whether the worker runs cannot be observed.",
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
      body: JSON.stringify({ email, password, rememberMe: true }),
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

if (failures.length) {
  console.error(`Smoke checks failed: ${failures.length}`);
  process.exit(1);
}

console.log("Deployment smoke checks completed successfully.");
