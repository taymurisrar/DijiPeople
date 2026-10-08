import Link from "next/link";
import type { Metadata } from "next";
import type { PlatformHealth } from "@/app/_components/monitoring/health-overview-tiles";
import { MonitoringNav } from "@/app/_components/monitoring/monitoring-nav";
import { PageHeader } from "@/app/_components/ui/page-header";
import { requireSystemAdminUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Integrations",
};

type StripeDiagnostics = {
  secretKeyConfigured?: boolean;
  webhookConfigured?: boolean;
  mode?: string | null;
};

type State = { label: string; tone: "ok" | "warn" | "down" | "unknown" };

/**
 * Integration readiness, from real checks only.
 *
 * The email card used to carry a hardcoded "Review provider" pill — styled
 * exactly like the Stripe card's real state, so it read as a status when it
 * was a sentence. It now shows the email component of the same health probe
 * the overview uses (delivery log and provider configuration), and says
 * "Unknown" with the probe's reason when there is nothing to assess.
 */
export default async function MonitoringIntegrationsPage() {
  await requireSystemAdminUser("/settings/monitoring/integrations");
  const [diagnostics, health] = await Promise.all([
    apiRequestJson<StripeDiagnostics>("/super-admin/billing/diagnostics"),
    apiRequestJson<PlatformHealth>("/platform/monitoring/health").catch(
      () => null,
    ),
  ]);

  const stripeState: State = diagnostics.secretKeyConfigured
    ? diagnostics.webhookConfigured
      ? { label: "Configured", tone: "ok" }
      : { label: "Webhook missing", tone: "warn" }
    : { label: "Not configured", tone: "down" };
  const stripeDetail = [
    diagnostics.mode ? `${diagnostics.mode} mode` : null,
    diagnostics.secretKeyConfigured ? "API key set" : "No API key",
    diagnostics.webhookConfigured ? "webhook secret set" : "no webhook secret",
  ]
    .filter(Boolean)
    .join(" · ");

  const email = health?.components.email;
  const emailState: State = !email
    ? { label: "Unknown", tone: "unknown" }
    : email.status === "OK"
      ? { label: "Healthy", tone: "ok" }
      : email.status === "DEGRADED"
        ? { label: "Degraded", tone: "warn" }
        : email.status === "DOWN"
          ? { label: "Down", tone: "down" }
          : { label: "Unknown", tone: "unknown" };

  return (
    <main className="space-y-4">
      <PageHeader
        eyebrow="Platform monitoring"
        title="Integrations"
        description="Connection and delivery readiness for the external services the platform depends on."
      />
      <MonitoringNav current="/settings/monitoring/integrations" />
      <section className="grid gap-3 lg:grid-cols-2">
        <Integration
          description="Payments, price synchronization and webhook delivery."
          detail={stripeDetail}
          href="/settings/integrations/stripe"
          state={stripeState}
          title="Stripe"
        />
        <Integration
          description="Platform email provider and recent delivery."
          detail={email?.reason ?? "The health probe could not be reached."}
          href="/settings/email"
          state={emailState}
          title="Platform email"
        />
      </section>
    </main>
  );
}

const TONE: Record<State["tone"], string> = {
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warn: "bg-amber-50 text-amber-800 ring-amber-200",
  down: "bg-rose-50 text-rose-700 ring-rose-200",
  unknown: "bg-slate-100 text-slate-600 ring-slate-200",
};

function Integration({
  title,
  state,
  description,
  detail,
  href,
}: {
  title: string;
  state: State;
  description: string;
  detail: string;
  href: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-950">{title}</h2>
        <span
          className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${TONE[state.tone]}`}
        >
          {state.label}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
      <Link
        className="mt-3 inline-flex text-sm font-semibold text-[var(--admin-primary)] hover:underline"
        href={href}
      >
        Open settings
      </Link>
    </section>
  );
}
