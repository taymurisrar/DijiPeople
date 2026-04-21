import type { ReactNode } from "react";

export function RecordRibbonBar({
  left,
  right,
}: {
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-3">{left}</div>
        <div className="flex flex-wrap gap-3 xl:justify-end">{right}</div>
      </div>
    </section>
  );
}
