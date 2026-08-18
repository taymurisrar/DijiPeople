export type ProvisioningOperationalState =
  | "IN_PROGRESS"
  | "AT_RISK"
  | "BREACHED"
  | "MANUAL_ACTION_REQUIRED"
  | "FAILED"
  | "READY";

export type ProvisioningQueueRow = {
  runId: string;
  operationalState: ProvisioningOperationalState;
  tenantId: string;
  tenantName: string | null;
  customerName: string | null;
  planName: string | null;
  attempt: number;
  trigger: string;
  startedAt: string;
  completedAt: string | null;
  elapsedMs: number;
  targetReadyBy: string | null;
  currentStepKey: string | null;
  currentStepLabel: string | null;
  blocker: string | null;
  stepsTotal: number;
  stepsCompleted: number;
  correlationId: string | null;
};

/**
 * Presentation order is triage order, not alphabetical.
 *
 * A breached run is the most serious thing on the page and appears first;
 * READY is last because it needs nobody. An operator opening this screen at
 * 09:00 should read it top-down and stop when they run out of problems.
 */
const STATE_ORDER: ProvisioningOperationalState[] = [
  "BREACHED",
  "FAILED",
  "MANUAL_ACTION_REQUIRED",
  "AT_RISK",
  "IN_PROGRESS",
  "READY",
];

const STATE_LABEL: Record<ProvisioningOperationalState, string> = {
  BREACHED: "Breached",
  FAILED: "Failed",
  MANUAL_ACTION_REQUIRED: "Manual action required",
  AT_RISK: "At risk",
  IN_PROGRESS: "In progress",
  READY: "Ready",
};

/**
 * Colour carries emphasis, never meaning on its own.
 *
 * Every state also has a text label in the same cell, so the table is readable
 * without colour vision — the accessibility rule the shared `StatusPill` exists
 * to enforce and which a bare coloured dot would quietly break.
 */
const STATE_CLASS: Record<ProvisioningOperationalState, string> = {
  BREACHED: "bg-red-100 text-red-900 ring-red-300",
  FAILED: "bg-red-50 text-red-800 ring-red-200",
  MANUAL_ACTION_REQUIRED: "bg-amber-100 text-amber-900 ring-amber-300",
  AT_RISK: "bg-amber-50 text-amber-800 ring-amber-200",
  IN_PROGRESS: "bg-sky-50 text-sky-800 ring-sky-200",
  READY: "bg-emerald-50 text-emerald-800 ring-emerald-200",
};

export function ProvisioningQueue({
  rows,
  counts,
}: {
  rows: ProvisioningQueueRow[];
  counts: Record<string, number>;
}) {
  const ordered = [...rows].sort(
    (a, b) =>
      STATE_ORDER.indexOf(a.operationalState) -
        STATE_ORDER.indexOf(b.operationalState) ||
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );

  const needsAttention = rows.filter((row) =>
    ["BREACHED", "FAILED", "MANUAL_ACTION_REQUIRED", "AT_RISK"].includes(
      row.operationalState,
    ),
  ).length;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">
          Provisioning operations
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Every workspace being provisioned, and every one that is stuck.
          Figures come from recorded runs; nothing here is estimated.
        </p>
      </header>

      {/*
        One summary line rather than a row of stat cards. Six near-identical
        cards is the chip overload the dashboard already suffers from, and the
        only number an operator needs first is how many things need them.
      */}
      <section
        aria-label="Queue summary"
        className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
      >
        {rows.length === 0 ? (
          <p className="text-sm text-slate-600">
            No provisioning runs recorded. This is an empty queue, not a
            measurement of zero — nothing has been provisioned yet.
          </p>
        ) : (
          <>
            <p className="text-sm font-medium text-slate-900">
              {needsAttention === 0
                ? "Nothing needs attention."
                : `${needsAttention} run${needsAttention === 1 ? "" : "s"} need attention.`}
            </p>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
              {STATE_ORDER.filter((state) => counts[state]).map((state) => (
                <li key={state}>
                  <span className="font-semibold text-slate-900">
                    {counts[state]}
                  </span>{" "}
                  {STATE_LABEL[state].toLowerCase()}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {ordered.length > 0 ? (
        /*
          Scrolls inside its own container. A wide operational table must not
          make the page body scroll horizontally, which is what breaks the
          1366px laptop layout the brief calls out.
        */
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[64rem] border-collapse text-sm">
            <caption className="sr-only">
              Provisioning runs, most serious first
            </caption>
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-4 py-3 font-semibold">State</th>
                <th scope="col" className="px-4 py-3 font-semibold">Customer</th>
                <th scope="col" className="px-4 py-3 font-semibold">Workspace</th>
                <th scope="col" className="px-4 py-3 font-semibold">Plan</th>
                <th scope="col" className="px-4 py-3 font-semibold">Elapsed</th>
                <th scope="col" className="px-4 py-3 font-semibold">Progress</th>
                <th scope="col" className="px-4 py-3 font-semibold">Current step</th>
                <th scope="col" className="px-4 py-3 font-semibold">Blocker</th>
                <th scope="col" className="px-4 py-3 font-semibold">Attempt</th>
                <th scope="col" className="px-4 py-3 font-semibold">Correlation</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((row) => (
                <tr
                  key={row.runId}
                  className="border-b border-slate-100 last:border-0 align-top"
                >
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${STATE_CLASS[row.operationalState]}`}
                    >
                      {STATE_LABEL[row.operationalState]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-900">
                    {row.customerName ?? <Unknown />}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {row.tenantName ?? <Unknown />}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {row.planName ?? <Unknown />}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">
                    {formatElapsed(row.elapsedMs)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">
                    {row.stepsTotal > 0
                      ? `${row.stepsCompleted}/${row.stepsTotal}`
                      : <Unknown />}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {row.currentStepLabel ?? row.currentStepKey ?? <Unknown />}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {row.blocker ? (
                      <span className="line-clamp-3">{row.blocker}</span>
                    ) : (
                      <span className="text-slate-400">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">
                    {row.attempt}
                  </td>
                  <td className="px-4 py-3">
                    {row.correlationId ? (
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                        {row.correlationId}
                      </code>
                    ) : (
                      <Unknown />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

/**
 * An absent value, shown as absent.
 *
 * Rendering a dash rather than an empty cell or a plausible default: a blank
 * cell reads as a rendering bug, and a default reads as a fact.
 */
function Unknown() {
  return (
    <span className="text-slate-400" title="Not recorded">
      —
    </span>
  );
}

function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 24) return `${hours}h ${remainder}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
