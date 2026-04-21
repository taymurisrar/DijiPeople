type ReportBarListProps = {
  emptyLabel: string;
  items: Array<{
    label: string;
    value: number;
  }>;
  title: string;
};

export function ReportBarList({
  emptyLabel,
  items,
  title,
}: ReportBarListProps) {
  const maxValue = Math.max(...items.map((item) => item.value), 0);

  return (
    <section className="rounded-[24px] border border-border bg-white p-6 shadow-sm">
      <h3 className="font-serif text-2xl text-foreground">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{emptyLabel}</p>
      ) : (
        <div className="mt-5 grid gap-4">
          {items.map((item) => {
            const width =
              maxValue === 0 ? 0 : Math.max(10, Math.round((item.value / maxValue) * 100));

            return (
              <div key={item.label} className="grid gap-2">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium text-foreground">{item.label}</span>
                  <span className="text-muted">{item.value}</span>
                </div>
                <div className="h-3 rounded-full bg-slate-100">
                  <div
                    className="h-3 rounded-full bg-[linear-gradient(90deg,#0f766e,#38bdf8)]"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
