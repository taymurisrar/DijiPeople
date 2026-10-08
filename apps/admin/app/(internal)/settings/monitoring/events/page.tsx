import type { Metadata } from "next";
import {
  EventsTable,
  type PlatformEventRow,
} from "@/app/_components/monitoring/events-table";
import { MonitoringNav } from "@/app/_components/monitoring/monitoring-nav";
import { PageHeader } from "@/app/_components/ui/page-header";
import { requireSystemAdminUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Events",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/* The keys `GET /platform/events` reads; anything else in the URL stays here. */
const FORWARDED_KEYS = [
  "search",
  "source",
  "result",
  "severity",
  "environment",
  "correlationId",
  "tenantId",
  "customerAccountId",
  "eventCode",
  "from",
  "to",
  "page",
  "pageSize",
] as const;

export default async function EventsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireSystemAdminUser("/settings/monitoring/events");
  const resolved = await searchParams;
  const query = new URLSearchParams();
  for (const key of FORWARDED_KEYS) {
    const raw = resolved[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) query.set(key, value);
  }
  if (!query.has("pageSize")) query.set("pageSize", "50");
  const response = await apiRequestJson<{
    items: PlatformEventRow[];
    total: number;
    page?: number;
    pageSize?: number;
  }>(`/platform/events?${query}`);

  return (
    <main className="space-y-4">
      <PageHeader
        eyebrow="Platform monitoring"
        title="Events"
        description="Lifecycle activity — sign-ins, provisioning, billing webhooks, email — whether it succeeded or not, kept apart from the error log."
      />
      <MonitoringNav current="/settings/monitoring/events" />
      <EventsTable
        items={response.items}
        page={response.page ?? Number(query.get("page") ?? 1)}
        pageSize={response.pageSize ?? Number(query.get("pageSize"))}
        total={response.total}
      />
    </main>
  );
}
