import { ReactNode } from "react";

export function SectionCard({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    /*
     * min-w-0: as a grid or flex item a card otherwise takes the min-content
     * width of whatever it holds, so a wide table inside it widened the whole
     * page instead of scrolling inside its own container (My evidence at 768px).
     * Found by the Flow R responsive journeys.
     */
    <section className="min-w-0 rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
