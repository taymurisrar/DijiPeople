import {
  BillingDefaultsForm,
  type BillingDefaults,
} from "@/app/_components/billing-defaults-form";
import { SettingsFormCard } from "@/app/_components/settings/settings-form-card";
import { SettingsShell } from "@/app/_components/settings/settings-shell";
import { apiRequestJson } from "@/lib/server-api";

export default async function BillingSettingsPage() {
  const [settings, diagnostics] = await Promise.all([
    apiRequestJson<{ billingDefaults?: Partial<BillingDefaults> }>(
      "/super-admin/platform-settings",
    ),
    apiRequestJson<StripeDiagnostics>("/super-admin/billing/diagnostics").catch(
      () => null,
    ),
  ]);

  return (
    <SettingsShell
      title="Billing defaults"
      description="Configure global billing behavior while keeping transaction and reporting currencies governed by platform defaults."
    >
      <SettingsFormCard
        title="Billing behavior"
        description="Defaults are applied to newly created commercial records and can be overridden where a workflow explicitly supports it."
      >
        <BillingDefaultsForm initialDefaults={settings.billingDefaults ?? {}} />
      </SettingsFormCard>
      <SettingsFormCard
        title="Stripe health and configuration"
        description="Verification state is read from Stripe and persisted without exposing key material."
      >
        {diagnostics ? (
          <dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Health
              label="Enabled"
              value={diagnostics.enabled ? "Yes" : "No"}
            />
            <Health label="Mode" value={diagnostics.mode} />
            <Health
              label="Account"
              value={diagnostics.stripeAccountId ?? "Not verified"}
            />
            <Health
              label="Webhook"
              value={diagnostics.webhookConfigured ? "Configured" : "Missing"}
            />
            <Health
              label="Checkout-ready prices"
              value={String(diagnostics.checkoutReadyPlanPricesCount)}
            />
            <Health
              label="Recent webhook failures"
              value={String(diagnostics.recentWebhookFailuresCount)}
            />
            <Health
              label="Last verification"
              value={formatDate(diagnostics.lastVerification)}
            />
            <Health
              label="Last successful webhook"
              value={formatDate(diagnostics.lastSuccessfulWebhook?.processedAt)}
            />
            <Health
              label="Last failed webhook"
              value={formatDate(diagnostics.lastFailedWebhook?.updatedAt)}
            />
            <Health
              label="Success URL"
              value={diagnostics.checkoutSuccessUrl ?? "Not configured"}
            />
            <Health
              label="Cancel URL"
              value={diagnostics.checkoutCancelUrl ?? "Not configured"}
            />
            <Health
              label="Portal return URL"
              value={diagnostics.customerPortalReturnUrl ?? "Not configured"}
            />
          </dl>
        ) : (
          <p className="text-sm text-amber-700">
            Stripe diagnostics are currently unavailable.
          </p>
        )}
      </SettingsFormCard>
    </SettingsShell>
  );
}

type StripeDiagnostics = {
  enabled: boolean;
  mode: string;
  stripeAccountId: string | null;
  webhookConfigured: boolean;
  checkoutReadyPlanPricesCount: number;
  recentWebhookFailuresCount: number;
  lastVerification: string | null;
  lastSuccessfulWebhook: { processedAt: string | null } | null;
  lastFailedWebhook: { updatedAt: string } | null;
  checkoutSuccessUrl: string | null;
  checkoutCancelUrl: string | null;
  customerPortalReturnUrl: string | null;
};

function Health({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-2 break-all text-sm font-medium text-slate-950">
        {value}
      </dd>
    </div>
  );
}

function formatDate(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Never";
}
