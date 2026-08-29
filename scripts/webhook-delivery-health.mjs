#!/usr/bin/env node
/**
 * Is Stripe actually reaching us? — the question `go-live.sh` could not ask.
 *
 * On 2026-08-24 that script reported "1 blocker" — Stripe test mode — while
 * every webhook delivery was being rejected with `400 VALIDATION_FAILED`
 * (BUG-0989, ITEM-0094). None of its five checks touched delivery, so the one
 * failure where a customer is charged and the platform never learns of it was
 * invisible to the check written to find exactly that class of problem.
 *
 * **This does not send a probe, deliberately.** A deliberately-invalid
 * signature is rejected whether the signing secret is right or wrong, which is
 * why the probe used during that diagnosis could not confirm the fix. A green
 * probe would have been worse than no probe. What is read instead is what
 * actually happened: the delivery history the API already keeps.
 *
 * Prints one line, `VERDICT|message`, for the shell to branch on:
 *
 *   OK    deliveries are arriving and the recent ones succeeded
 *   WARN  nothing has arrived at all — expected before go-live, and a finding
 *         after it, so it is reported rather than swallowed
 *   BLOCK deliveries are arriving and failing
 *
 * Exits non-zero only when it could not answer. "Could not read it" and "read
 * it and it is bad" must not look the same to the caller.
 */

const args = process.argv.slice(2);
const apiIndex = args.indexOf('--api');
const API = (
  apiIndex >= 0 ? args[apiIndex + 1] : process.env.API_BASE_URL
)?.replace(/\/$/, '');

if (!API) {
  console.error('Usage: node scripts/webhook-delivery-health.mjs --api <base-url>');
  process.exit(2);
}

const email = process.env.SYNC_ADMIN_EMAIL || process.env.BOOTSTRAP_ADMIN_EMAIL;
const password =
  process.env.SYNC_ADMIN_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD;

if (!email || !password) {
  console.error('No admin credentials; cannot read billing/diagnostics.');
  process.exit(2);
}

async function call(path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

/*
 * `process.exitCode` rather than `process.exit()` from here down.
 *
 * Exiting while a fetch handle is still closing trips a libuv assertion on
 * Windows and reports 127 — which the caller reads as "crashed", not "could not
 * answer". The two must stay distinguishable: `go-live.sh` treats an
 * unreadable answer as unknown, and unknown is never health.
 */
const login = await call('/admin/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
});
const token = login.body?.accessToken ?? login.body?.tokens?.accessToken;
if (!token) {
  console.error('Login failed:', login.status);
  process.exitCode = 2;
}

const diagnostics = token
  ? await call('/super-admin/billing/diagnostics', {
      headers: { Authorization: `Bearer ${token}` },
    })
  : { status: 0, body: null };
if (diagnostics.status !== 200) {
  if (token) console.error('billing/diagnostics answered', diagnostics.status);
  process.exitCode = 2;
}

const {
  recentWebhookFailuresCount = 0,
  lastSuccessfulWebhook = null,
  lastFailedWebhook = null,
} = diagnostics.body ?? {};

const stamp = (value) =>
  value?.createdAt ? new Date(value.createdAt).toISOString().slice(0, 16) : null;

const lastOk = stamp(lastSuccessfulWebhook);
const lastBad = stamp(lastFailedWebhook);

if (process.exitCode === 2) {
  // Could not answer. Say nothing on stdout: `go-live.sh` branches on the
  // verdict line, and an empty line is how it learns there is no verdict.
} else if (recentWebhookFailuresCount > 0) {
  console.log(
    `BLOCK|${recentWebhookFailuresCount} Stripe webhook delivery/deliveries failed in the last 7 days` +
      (lastBad ? ` (most recent ${lastBad})` : '') +
      '. A customer can be charged without the platform learning of it.',
  );
} else if (!lastOk && !lastBad) {
  /*
   * An empty table is not health. Before go-live it is expected — nothing has
   * been sold — and after it, it is the same silence the original defect wore.
   * Reported as WARN so the operator decides which of the two they are looking
   * at, rather than the script deciding for them.
   */
  console.log(
    'WARN|No Stripe webhook delivery has ever been recorded. Expected before the first sale; after it, this is the silent-failure signature.',
  );
} else {
  console.log(
    `OK|Stripe deliveries are arriving and none failed in the last 7 days` +
      (lastOk ? ` (most recent success ${lastOk})` : '') +
      '.',
  );
}
