import type { Metadata } from "next";
import { MonitoringNav } from "@/app/_components/monitoring/monitoring-nav";
import {
  HealthOverviewTiles,
  type PlatformHealth,
} from "@/app/_components/monitoring/health-overview-tiles";
import {
  MonitoringOverview,
  type EventHealth,
  type OverviewIncident,
  type OverviewMetrics,
} from "@/app/_components/monitoring/monitoring-overview";
import { PageHeader } from "@/app/_components/ui/page-header";
import { requireSystemAdminUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Monitoring",
};

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

  const [incidents, events, health] = await Promise.all([
    /*
     * The error log's own endpoint: the ten most recently active unresolved
     * incidents, plus the metrics. The metrics count the scope and ignore the
     * status filter, so this one request yields both the open slice and the
     * all-time counts the tiles show.
     */
    apiRequestJson<{
      items: OverviewIncident[];
      metrics: OverviewMetrics;
    }>(
      "/platform/logs/events?pageSize=10&status=UNRESOLVED&sortBy=lastSeen&sortDirection=desc",
    ),
    apiRequestJson<EventHealth>("/platform/events/overview"),
    // TASK-0032 WP-06: "is the platform healthy" answered first, from real
    // dependency probes rather than inferred from the incident queue below.
    apiRequestJson<PlatformHealth>("/platform/monitoring/health"),
  ]);

  return (
    <main className="space-y-5">
      <PageHeader
        description="What needs a person right now, what is already being worked, and whether the platform itself is healthy."
        eyebrow="Platform monitoring"
        title="Monitoring"
      />
      <MonitoringNav current="/settings/monitoring" />
      <HealthOverviewTiles health={health} />
      <MonitoringOverview
        events={events}
        incidents={incidents.items}
        metrics={incidents.metrics}
      />
    </main>
  );
}
