import { redirect } from "next/navigation";

/*
 * Monitoring has one screen, error logs, but the bare segment is a natural
 * thing to link to and to type. Without this it returned the admin 404, which
 * is what the platform dashboard's "Monitoring settings" action did.
 */
export default function MonitoringSettingsPage() {
  redirect("/settings/monitoring/error-logs");
}
