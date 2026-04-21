import type { ReactNode } from "react";

export function ModuleDetailLayout({
  ribbon,
  children,
}: {
  title: string;
  description?: string;
  ribbon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      {ribbon}
      {children}
    </div>
  );
}
