import { Lock } from "lucide-react";

export function ModuleAccessDeniedState({
  description = "Your current role does not allow access to this module surface.",
  title = "Access denied",
}: {
  readonly description?: string;
  readonly title?: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-8 text-center shadow-sm">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-danger/10 text-danger">
        <Lock className="h-5 w-5" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted">
        {description}
      </p>
    </section>
  );
}
