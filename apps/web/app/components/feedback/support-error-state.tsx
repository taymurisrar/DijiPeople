type SupportErrorStateProps = {
  message?: string;
  title?: string;
  traceId?: string | null;
};

export function SupportErrorState({
  message = process.env.NEXT_PUBLIC_SUPPORT_ERROR_MESSAGE ??
    "Something went wrong. Please contact support if the problem continues.",
  title = "Something went wrong",
  traceId,
}: SupportErrorStateProps) {
  return (
    <section className="rounded-[24px] border border-border bg-surface p-8 shadow-sm">
      <p className="text-sm font-semibold uppercase text-muted">Error</p>
      <h2 className="mt-2 text-2xl font-semibold text-foreground">{title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{message}</p>
      {traceId ? (
        <p className="mt-4 rounded-xl border border-border bg-white px-3 py-2 text-sm text-muted">
          Support reference: <span className="font-mono">{traceId}</span>
        </p>
      ) : null}
    </section>
  );
}
