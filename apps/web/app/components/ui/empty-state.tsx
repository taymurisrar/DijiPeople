import { ReactNode } from "react";

export function EmptyState({
  action,
  description,
  title,
}: {
  action?: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className="rounded-[22px] border border-dashed border-border bg-white/70 px-6 py-10 text-center">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
