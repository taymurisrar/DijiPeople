import { AttendanceSummaryResponse } from "../types";

export function AttendanceSummaryStrip({
  summary,
}: {
  summary: AttendanceSummaryResponse;
}) {
  const cards = [
    { label: "Entries", value: summary.totals.entries },
    { label: "Present", value: summary.totals.present },
    { label: "Late", value: summary.totals.late },
    { label: "Remote", value: summary.totals.remote },
    { label: "Office", value: summary.totals.office },
    { label: "Worked", value: summary.totals.workedLabel ?? "0 mins" },
  ];

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
      {cards.map((card) => (
        <article
          key={card.label}
          className="rounded-[22px] border border-border bg-surface p-5 shadow-sm"
        >
          <p className="text-xs uppercase tracking-[0.14em] text-muted">
            {card.label}
          </p>
          <p className="mt-3 text-2xl font-semibold text-foreground">
            {card.value}
          </p>
        </article>
      ))}
    </section>
  );
}
