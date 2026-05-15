type ModulePlaceholderPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  nextStep: string;
};

export function ModulePlaceholderPage({
  eyebrow,
  title,
  description,
  nextStep,
}: ModulePlaceholderPageProps) {
  return (
    <main className="grid gap-6">
      <section className="rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(236,252,247,0.88))] p-8 shadow-lg">
        <p className="text-sm uppercase tracking-[0.2em] text-muted">{eyebrow}</p>
        <h3 className="mt-4 max-w-3xl font-serif text-4xl leading-tight text-foreground">
          {title}
        </h3>
        <p className="mt-4 max-w-3xl text-lg text-muted">{description}</p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Current State
          </p>
          <p className="mt-4 text-base text-muted">
            This route is intentionally a placeholder so we can plug in the real
            module without reworking the shell.
          </p>
        </article>
        <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">
            Next Build Step
          </p>
          <p className="mt-4 text-base text-muted">{nextStep}</p>
        </article>
      </section>
    </main>
  );
}
