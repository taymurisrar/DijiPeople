import {
  ErrorLogsTable,
  type PlatformLogFile,
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

  const logs = await apiRequestJson<PlatformLogFile[]>("/platform/logs");

  return (
    <main className="space-y-5">
      <PageHeader
        eyebrow="Platform monitoring"
        title="Error logs"
        description="Review and download application log files from the secured platform log directory."
      />
      <ErrorLogsTable logs={logs} />
    </main>
  );
}
