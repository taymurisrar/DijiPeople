import type { WorkflowRun } from "@/lib/workflows-api";
import {
  formatDateTime,
  SettingsPanel,
  StatusBadge,
} from "../../notifications/_components/notification-ui";

/*
 * A workflow that quietly does nothing is worse than one that fails loudly, so
 * every attempt is listed here with the reason it did not send.
 */
export function WorkflowRunHistory({ runs }: { runs: WorkflowRun[] }) {
  return (
    <SettingsPanel
      title="Run History"
      description="The last 100 times this workflow was triggered, including the ones that were skipped and why."
    >
      {runs.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-[0.14em] text-muted">
                <th className="py-2 pr-4">When</th>
                <th className="py-2 pr-4">Result</th>
                <th className="py-2 pr-4">Emails sent</th>
                <th className="py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr className="border-b border-border/60" key={run.id}>
                  <td className="py-2 pr-4 whitespace-nowrap text-muted">
                    {formatDateTime(run.startedAt)}
                  </td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="py-2 pr-4">{run.actionsRun}</td>
                  <td className="py-2 text-muted">{run.error ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted">
          This workflow has not run yet. It runs the next time its event
          happens, provided it is active.
        </p>
      )}
    </SettingsPanel>
  );
}
