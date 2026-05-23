import Link from "next/link";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { WebhookEventsClient } from "@/app/_components/billing/webhook-events-client";
import { PageHeader } from "@/app/_components/ui/page-header";
import { apiRequestJson } from "@/lib/server-api";

type WebhookEventsResponse = Parameters<
  typeof WebhookEventsClient
>[0]["initialData"];

export default async function StripeWebhookEventsPage() {
  const data = await apiRequestJson<WebhookEventsResponse>(
    "/super-admin/billing/stripe-webhook-events?page=1&pageSize=25",
  );

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Stripe diagnostics"
        title="Webhook events"
        description="Review verified Stripe webhook deliveries, processing outcomes, and retry failed events safely."
        actions={
          <Link
            href="/billing"
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Billing overview
          </Link>
        }
      />

      <section className="rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
        <div className="flex items-start gap-3">
          <RotateCcw className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Retry is only available for events marked FAILED. Processing uses
            the stored verified payload and the same idempotent webhook
            handlers.
          </p>
        </div>
      </section>

      <WebhookEventsClient initialData={data} />
    </main>
  );
}
