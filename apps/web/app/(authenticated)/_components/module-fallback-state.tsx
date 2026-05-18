import { Button } from "@/app/components/ui/button";

type ModuleFallbackStateProps = {
  eyebrow: string;
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
};

export function ModuleFallbackState({
  eyebrow,
  title,
  description,
  actionHref,
  actionLabel,
}: ModuleFallbackStateProps) {
  return (
    <section className="rounded-[24px] border border-dashed border-border bg-surface p-10 shadow-sm">
      <p className="text-sm uppercase tracking-[0.18em] text-muted">
        {eyebrow}
      </p>
      <h3 className="mt-3 text-2xl font-semibold text-foreground">{title}</h3>
      <p className="mt-3 max-w-3xl text-muted">{description}</p>
      {actionHref && actionLabel ? (
        <Button href={actionHref} variant="secondary" className="mt-6">
          {actionLabel}
        </Button>
      ) : null}
    </section>
  );
}
