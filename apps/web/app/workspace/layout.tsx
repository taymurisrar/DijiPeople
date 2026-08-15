import type { ReactNode } from "react";

/**
 * Workspace state pages.
 *
 * These render when a hostname resolves to something other than a servable
 * workspace: unknown, suspended, still being prepared, or retired. They are
 * deliberately outside the authenticated and public shells — there is no tenant
 * branding to apply, because the whole point is that we are not serving a
 * workspace.
 */
export default function WorkspaceStateLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-16">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        {children}
      </div>
    </main>
  );
}
