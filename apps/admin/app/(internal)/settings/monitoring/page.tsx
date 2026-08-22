import { MonitoringNav } from "@/app/_components/monitoring/monitoring-nav";
import {
  MonitoringOverview,
  type EventHealth,
  type OverviewIncident,
  type OverviewMetrics,
} from "@/app/_components/monitoring/monitoring-overview";
import { PageHeader } from "@/app/_components/ui/page-header";
import { requireSystemAdminUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";

/**
 * The monitoring landing page.
 *
 * It used to call one endpoint — the platform event stream — and render four
 * counters, a list of event codes by source, and ten recent events. All of it
 * real, none of it actionable: "Events (24h): 4,182" answers a question nobody
 * asks, while "which customer is broken right now" was answered by a different
 * endpoint this page never called.
 *
 * Two requests now, in parallel. The incident queue is the work; the event
 * stream is the context that explains a spike in it.
 */
export default async function MonitoringSettingsPage() {
  await requireSystemAdminUser("/settings/monitoring");

  const [incidents, events] = await Promise.all([
    /*
     * The queue's own endpoint, with its own filters — asking for the most
     * recent 25 rather than re-implementing pagination on a landing page. The
     * page filters that slice in the browser and hands the same filters to the
     * full queue when an agent wants more, so the two never drift into meaning
     * different things.
     */
    apiRequestJson<{
      items: OverviewIncident[];
      metrics: OverviewMetrics;
    }>("/platform/logs/events?pageSize=25&sortBy=createdAt&sortDirection=desc"),
    apiRequestJson<EventHealth>("/platform/events/overview"),
  ]);

  return (
    <main className="space-y-5">
      <PageHeader
        description="What needs a person right now, what is already being worked, and whether the platform itself is healthy."
        eyebrow="Operations"
        title="Monitoring"
      />
      <MonitoringNav current="/settings/monitoring" />
      <MonitoringOverview
        events={events}
        incidents={incidents.items}
        metrics={incidents.metrics}
      />
    </main>
  );
}
