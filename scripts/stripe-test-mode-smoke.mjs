import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../services/api/.env", import.meta.url)) });
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY?.trim();
const mode = process.env.STRIPE_MODE?.trim().toLowerCase();
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
if (mode !== "test" || !key?.startsWith("sk_test_")) {
  throw new Error(
    "Refusing to run: STRIPE_MODE=test and an sk_test_ key are required.",
  );
}

const stripe = new Stripe(key, {
  apiVersion: process.env.STRIPE_API_VERSION,
});
const runId = `codex_${Date.now()}`;
const created = {
  product: null,
  customer: null,
  subscription: null,
  coupon: null,
  promotionCode: null,
  prices: [],
};
const result = {};

try {
  const account = await stripe.account.retrieve();
  result.connection = { ok: true, accountId: account.id, livemode: false };

  const product = await stripe.products.create({
    name: `DijiPeople automated test ${runId}`,
    metadata: { source: "dijipeople_test_smoke", runId },
  });
  created.product = product.id;
  result.product = { ok: true, id: product.id };

  const priceInputs = [
    { key: "flatMonthly", amount: 29900, model: "FLAT", interval: "month" },
    { key: "flatAnnual", amount: 299000, model: "FLAT", interval: "year" },
    {
      key: "perSeatMonthly",
      amount: 800,
      model: "PER_SEAT",
      interval: "month",
    },
    { key: "perSeatAnnual", amount: 8000, model: "PER_SEAT", interval: "year" },
  ];
  const prices = {};
  for (const item of priceInputs) {
    const price = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: item.amount,
      recurring: { interval: item.interval, usage_type: "licensed" },
      metadata: {
        source: "dijipeople_test_smoke",
        runId,
        billingModel: item.model,
      },
    });
    created.prices.push(price.id);
    prices[item.key] = price;
  }
  result.prices = Object.fromEntries(
    Object.entries(prices).map(([keyName, price]) => [
      keyName,
      {
        ok: true,
        id: price.id,
        interval: price.recurring?.interval,
        amount: price.unit_amount,
      },
    ]),
  );

  const customer = await stripe.customers.create({
    name: `DijiPeople automated customer ${runId}`,
    email: `stripe-smoke+${runId}@example.com`,
    metadata: { source: "dijipeople_test_smoke", runId },
  });
  created.customer = customer.id;
  result.customer = { ok: true, id: customer.id };

  const coupon = await stripe.coupons.create({
    name: `20% first 3 months ${runId}`,
    percent_off: 20,
    duration: "repeating",
    duration_in_months: 3,
    metadata: { source: "dijipeople_test_smoke", runId },
  });
  created.coupon = coupon.id;
  const promotionCode = await stripe.promotionCodes.create({
    promotion: { type: "coupon", coupon: coupon.id },
    code: `DIJI${Date.now()}`,
    metadata: { source: "dijipeople_test_smoke", runId },
  });
  created.promotionCode = promotionCode.id;
  result.discount = {
    ok: true,
    couponId: coupon.id,
    promotionCodeId: promotionCode.id,
  };

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customer.id,
    line_items: [{ price: prices.perSeatMonthly.id, quantity: 3 }],
    discounts: [{ coupon: coupon.id }],
    success_url:
      "https://example.com/stripe-smoke/success?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: "https://example.com/stripe-smoke/cancel",
    metadata: { source: "dijipeople_test_smoke", runId, licensedSeats: "3" },
    subscription_data: {
      metadata: { source: "dijipeople_test_smoke", runId, licensedSeats: "3" },
    },
  });
  const checkoutLineItems = await stripe.checkout.sessions.listLineItems(
    checkout.id,
  );
  result.checkout = {
    ok: true,
    id: checkout.id,
    quantity: checkoutLineItems.data[0]?.quantity,
    discountApplied: checkout.total_details?.amount_discount !== null,
  };

  const paymentMethod = await stripe.paymentMethods.attach("pm_card_visa", {
    customer: customer.id,
  });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: paymentMethod.id },
  });
  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: prices.perSeatMonthly.id, quantity: 3 }],
    discounts: [{ coupon: coupon.id }],
    payment_behavior: "error_if_incomplete",
    metadata: { source: "dijipeople_test_smoke", runId, licensedSeats: "3" },
    expand: ["latest_invoice"],
  });
  created.subscription = subscription.id;
  const subscriptionItem = subscription.items.data[0];
  const latestInvoice =
    typeof subscription.latest_invoice === "string"
      ? await stripe.invoices.retrieve(subscription.latest_invoice)
      : subscription.latest_invoice;
  result.subscription = {
    ok: true,
    id: subscription.id,
    status: subscription.status,
    quantity: subscriptionItem?.quantity,
    priceId: subscriptionItem?.price?.id,
    discountApplied: subscription.discounts.length > 0,
  };
  result.invoice = {
    ok: Boolean(latestInvoice),
    id: latestInvoice?.id ?? null,
    status: latestInvoice?.status ?? null,
    paid:
      latestInvoice?.status === "paid" || latestInvoice?.amount_remaining === 0,
    amountPaid: latestInvoice?.amount_paid ?? null,
    amountRemaining: latestInvoice?.amount_remaining ?? null,
    discountApplied: (latestInvoice?.total_discount_amounts?.length ?? 0) > 0,
  };

  if (webhookSecret?.startsWith("whsec_")) {
    const payload = JSON.stringify({
      id: `evt_${runId}`,
      object: "event",
      type: "customer.subscription.updated",
      data: { object: subscription },
    });
    const header = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });
    const event = stripe.webhooks.constructEvent(
      payload,
      header,
      webhookSecret,
    );
    result.webhookSignature = {
      ok: event.id === `evt_${runId}`,
      eventType: event.type,
    };
  } else {
    result.webhookSignature = {
      ok: false,
      reason: "STRIPE_WEBHOOK_SECRET missing or invalid format",
    };
  }

  const cancelled = await stripe.subscriptions.cancel(subscription.id);
  created.subscription = null;
  result.cancellation = {
    ok: cancelled.status === "canceled",
    status: cancelled.status,
  };
} finally {
  if (created.subscription)
    await stripe.subscriptions
      .cancel(created.subscription)
      .catch(() => undefined);
  if (created.promotionCode)
    await stripe.promotionCodes
      .update(created.promotionCode, { active: false })
      .catch(() => undefined);
  if (created.coupon)
    await stripe.coupons.del(created.coupon).catch(() => undefined);
  for (const priceId of created.prices)
    await stripe.prices
      .update(priceId, { active: false })
      .catch(() => undefined);
  if (created.product)
    await stripe.products
      .update(created.product, { active: false })
      .catch(() => undefined);
  if (created.customer)
    await stripe.customers.del(created.customer).catch(() => undefined);
  result.cleanup = { attempted: true };
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
