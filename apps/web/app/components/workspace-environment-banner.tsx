import {
  getWorkspaceContext,
  isNonProductionWorkspace,
} from "@/lib/workspace-context";

const ENVIRONMENT_COPY: Record<
  string,
  { label: string; detail: string; className: string }
> = {
  UAT: {
    label: "UAT environment",
    detail: "Test data may not reflect production.",
    className: "border-amber-300 bg-amber-100 text-amber-950",
  },
  SANDBOX: {
    label: "Sandbox environment",
    detail: "This workspace is for experimentation. Data may be reset.",
    className: "border-violet-300 bg-violet-100 text-violet-950",
  },
  DEVELOPMENT: {
    label: "Development environment",
    detail: "This workspace is not for customer use.",
    className: "border-slate-300 bg-slate-200 text-slate-900",
  },
};

/**
 * A persistent marker on non-production workspaces.
 *
 * `maseer.dijipeople.com` and `maseer-uat.dijipeople.com` render the same
 * application with the same branding, so the address bar is the only other thing
 * distinguishing them — and nobody reads it. Someone entering leave, approving
 * payroll or deleting an employee needs to know which one they are in.
 *
 * Production renders nothing at all: a banner on every screen of the real
 * workspace is noise, and noise is what gets ignored.
 */
export async function WorkspaceEnvironmentBanner() {
  const context = await getWorkspaceContext();

  if (!context || !isNonProductionWorkspace(context.environmentType)) {
    return null;
  }

  const copy = ENVIRONMENT_COPY[context.environmentType];
  if (!copy) return null;

  return (
    <div
      role="status"
      className={`flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 border-b px-4 py-1.5 text-center text-xs font-semibold ${copy.className}`}
    >
      <span className="uppercase tracking-[0.14em]">{copy.label}</span>
      <span className="font-normal opacity-90">{copy.detail}</span>
    </div>
  );
}

/**
 * The workspace label for the app shell.
 *
 * Shows the workspace name, and the environment when it is not production.
 * Never shows the tenant id — an internal identifier on a customer-facing screen
 * is noise to them and an information leak to everyone else.
 */
export async function WorkspaceContextLabel() {
  const context = await getWorkspaceContext();
  if (!context?.name) return null;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
      <span className="truncate">{context.name}</span>
      {isNonProductionWorkspace(context.environmentType) ? (
        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
          {context.environmentType}
        </span>
      ) : null}
    </span>
  );
}
