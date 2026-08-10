import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../services/api/.env", import.meta.url)) });
import Stripe from "stripe";

const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
if (!secret?.startsWith("whsec_"))
  throw new Error("A test webhook secret is required.");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: process.env.STRIPE_API_VERSION,
});
const eventId = `evt_dijipeople_smoke_${Date.now()}`;
const payload = JSON.stringify({
  id: eventId,
  object: "event",
  api_version: process.env.STRIPE_API_VERSION,
  created: Math.floor(Date.now() / 1000),
  data: {
    object: { id: `clock_${Date.now()}`, object: "test_helpers.test_clock" },
  },
  livemode: false,
  pending_webhooks: 1,
  request: null,
  type: "test_helpers.test_clock.created",
});
const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });

async function deliver() {
  const response = await fetch(
    "http://127.0.0.1:4000/api/billing/stripe/webhook",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signature,
      },
      body: payload,
    },
  );
  return {
    status: response.status,
    body: await response.json().catch(() => null),
  };
}

const first = await deliver();
const duplicate = await deliver();
const loginResponse = await fetch("http://127.0.0.1:3002/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    rememberMe: false,
  }),
});
const accessToken = loginResponse.headers
  .getSetCookie()
  .map((value) => value.split(";", 1)[0])
  .find((value) => value.includes("_access_token="))
  ?.split("=", 2)[1];
if (!accessToken) throw new Error("Unable to verify webhook telemetry.");
const eventsResponse = await fetch(
  `http://127.0.0.1:4000/api/platform/events?correlationId=${encodeURIComponent(eventId)}`,
  {
    headers: {
      authorization: `Bearer ${accessToken}`,
      "x-dijipeople-app": "admin",
    },
  },
);
const events = await eventsResponse.json();
const telemetryObserved = events.items?.some(
  (item) =>
    item.eventCode === "STRIPE_WEBHOOK_PROCESSED" && item.source === "STRIPE",
);
if (!telemetryObserved)
  throw new Error("Stripe webhook processing event was not observable.");
process.stdout.write(
  `${JSON.stringify({ eventId, first, duplicate, telemetryObserved }, null, 2)}\n`,
);
