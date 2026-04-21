"use client";

import { useState } from "react";
import { AdminSidebar } from "./admin-sidebar";
import { AdminTopbar } from "./admin-topbar";

type AdminShellProps = {
  user: {
    firstName: string;
    lastName: string;
    email: string;
  };
  children: React.ReactNode;
};

export function AdminShell({ user, children }: AdminShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)]">
      <div className="mx-auto flex min-h-screen max-w-[1600px] gap-4 px-3 py-3 md:px-4 md:py-4">
        <AdminSidebar
          collapsed={sidebarCollapsed}
          isOpen={sidebarOpen}
          onCollapseToggle={() => setSidebarCollapsed((current) => !current)}
          onClose={() => setSidebarOpen(false)}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <AdminTopbar
            email={user.email}
            firstName={user.firstName}
            lastName={user.lastName}
            onMenuToggle={() => setSidebarOpen((current) => !current)}
          />
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
