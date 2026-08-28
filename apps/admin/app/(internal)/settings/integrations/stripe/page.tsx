import type { Metadata } from "next";
import { SettingsFormCard } from "@/app/_components/settings/settings-form-card";
import { SettingsShell } from "@/app/_components/settings/settings-shell";
import { StripeConnectionTest } from "@/app/_components/settings/stripe-connection-test";
import { apiRequestJson } from "@/lib/server-api";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Stripe",
};


type Diagnostics = {
  mode: string;
  secretKeyConfigured: boolean;
  publishableKeyConfigured: boolean;
  webhookConfigured: boolean;
  webhookEndpoint: string;
  stripeAccountId: string | null;
  lastVerification: string | null;
  lastStripeSync: string | null;
  lastSuccessfulWebhook: { processedAt: string | null } | null;
  lastFailedWebhook: { updatedAt: string; errorMessage?: string | null } | null;
  checkoutReadyPlanPricesCount: number;
  recentWebhookFailuresCount: number;
};

export default async function StripeSettingsPage() {
  const diagnostics = await apiRequestJson<Diagnostics>(
    "/super-admin/billing/diagnostics",
  ).catch(() => null);
  return (
    <SettingsShell
      title="Stripe integration"
      description="Safe configuration health, connection verification, synchronization, and webhook status. Secret values are never displayed."
    >
      <SettingsFormCard
        title="Configuration health"
        description="Configure these values in services/api/.env or the API runtime environment."
      >
        {diagnostics ? (
          <div className="space-y-4">
            <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Health
                label="Mode"
                value={friendly(diagnostics.mode)}
                ok={diagnostics.mode === "test" || diagnostics.mode === "live"}
              />
              <Health
                label="Secret key"
                value={
                  diagnostics.secretKeyConfigured ? "Configured" : "Missing"
                }
                ok={diagnostics.secretKeyConfigured}
              />
              <Health
                label="Publishable key"
                value={
                  diagnostics.publishableKeyConfigured
                    ? "Configured"
                    : "Missing"
                }
                ok={diagnostics.publishableKeyConfigured}
              />
              <Health
                label="Webhook secret"
                value={diagnostics.webhookConfigured ? "Configured" : "Missing"}
                ok={diagnostics.webhookConfigured}
              />
              <Health
                label="Connection"
                value={
                  diagnostics.stripeAccountId ? "Connected" : "Not verified"
                }
                ok={Boolean(diagnostics.stripeAccountId)}
              />
              <Health
                label="Checkout-ready prices"
                value={String(diagnostics.checkoutReadyPlanPricesCount)}
                ok={diagnostics.checkoutReadyPlanPricesCount > 0}
              />
              <Health
                label="Webhook failures (7d)"
                value={String(diagnostics.recentWebhookFailuresCount)}
                ok={diagnostics.recentWebhookFailuresCount === 0}
              />
              <Health
                label="Webhook endpoint"
                value={diagnostics.webhookEndpoint}
                ok={diagnostics.webhookConfigured}
              />
            </dl>
            <StripeConnectionTest />
          </div>
        ) : (
          <p className="text-sm text-rose-700">
            Stripe diagnostics are unavailable. Confirm the API is running and
            STRIPE_SECRET_KEY and STRIPE_MODE are valid.
          </p>
        )}
      </SettingsFormCard>
      {diagnostics ? (
        <SettingsFormCard
          title="Recent Stripe activity"
          description="Webhook processing is authoritative for subscription and payment state."
        >
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Health
              label="Last connection test"
              value={date(diagnostics.lastVerification)}
              ok={Boolean(diagnostics.lastVerification)}
            />
            <Health
              label="Last Stripe sync"
              value={date(diagnostics.lastStripeSync)}
              ok={Boolean(diagnostics.lastStripeSync)}
            />
            <Health
              label="Last successful webhook"
              value={date(diagnostics.lastSuccessfulWebhook?.processedAt)}
              ok={Boolean(diagnostics.lastSuccessfulWebhook)}
            />
            <Health
              label="Last failed webhook"
              value={date(diagnostics.lastFailedWebhook?.updatedAt)}
              ok={!diagnostics.lastFailedWebhook}
            />
          </dl>
        </SettingsFormCard>
      ) : null}
    </SettingsShell>
  );
}

function Health({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd
        className={`mt-1 break-words text-sm font-semibold ${ok ? "text-emerald-700" : "text-amber-700"}`}
      >
        {value}
      </dd>
    </div>
  );
}
function date(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Never";
}
function friendly(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
