import Link from "next/link";

type AccessDeniedStateProps = {
  title?: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
};

export function AccessDeniedState({
  title = "You do not have access to this area.",
  description = "Your session is valid, but your current role does not include permission for this page or feature.",
  actionHref = "/dashboard",
  actionLabel = "Back to dashboard",
}: AccessDeniedStateProps) {
  return (
    <section className="rounded-[24px] border border-border bg-surface p-10 shadow-sm">
      <p className="text-sm uppercase tracking-[0.18em] text-muted">
        Access denied
      </p>
      <h3 className="mt-3 text-2xl font-semibold text-foreground">{title}</h3>
      <p className="mt-3 max-w-3xl text-muted">{description}</p>
      <Link
        className="mt-6 inline-flex rounded-2xl border border-border px-5 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
        href={actionHref}
      >
        {actionLabel}
      </Link>
    </section>
  );
}
