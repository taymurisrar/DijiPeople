import type { ReactNode } from "react";

export function RecordRibbonBar({
  left,
  leftCommands,
  right,
  rightMeta,
}: {
  left?: ReactNode;
  leftCommands?: ReactNode;
  right?: ReactNode;
  rightMeta?: ReactNode;
}) {
  const commands = leftCommands ?? left;
  const metadata = rightMeta ?? right;

  return (
    <section className="relative z-20 w-full overflow-visible rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="flex h-12 w-full min-w-0 items-center justify-between gap-3 overflow-visible">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max items-center gap-1.5">{commands}</div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 overflow-visible">
          {metadata}
        </div>
      </div>
    </section>
  );
}
