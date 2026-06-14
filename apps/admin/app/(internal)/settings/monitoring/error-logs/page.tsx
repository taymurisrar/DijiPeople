import {
  ErrorLogsTable,
  type PlatformErrorEvent,
} from "@/app/_components/monitoring/error-logs-table";
import { PageHeader } from "@/app/_components/ui/page-header";
import { requireSystemAdminUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";

export default async function PlatformErrorLogsPage() {
  const user = await requireSystemAdminUser("/settings/monitoring/error-logs");
  if (user.role !== "SUPER_ADMIN") {
    return (
      <main className="space-y-5">
        <PageHeader
          eyebrow="Monitoring"
          title="Error logs"
          description="Only Platform Super Admin can access platform monitoring."
        />
      </main>
    );
  }

  const logs = await apiRequestJson<PlatformErrorEvent[]>(
    "/platform/logs/events?pageSize=250",
  );

  return (
    <main className="space-y-5">
      <PageHeader
        eyebrow="Platform monitoring"
        title="Error logs"
        description="Trace sanitized web and API incidents by reference number, tenant, source, and severity."
      />
      <ErrorLogsTable logs={logs} />
    </main>
  );
}
