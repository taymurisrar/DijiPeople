"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable } from "@/app/_components/crm/data-table";
import { TenantStatusBadge } from "@/app/_components/tenant-status-badge";
import { formatDate } from "@/lib/formatters";

export type TenantAccessUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  accessStatus: string;
  accessType: "GLOBAL_ADMIN" | "SERVICE_ACCOUNT";
  lastLoginAt: string | null;
  createdAt: string;
  createdBy: {
    id: string;
    fullName: string;
    email: string;
    role: string | null;
    source: string;
  } | null;
  activation: {
    id: string;
    status: string;
    expiresAt: string;
    consumedAt: string | null;
    createdAt: string;
  } | null;
};

export function TenantAccessManager({
  tenantId,
  users,
}: {
  tenantId: string;
  users: TenantAccessUser[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("create");
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch(
      `/api/super-admin/tenants/${tenantId}/access-users`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          email: form.get("email"),
          accessType: form.get("accessType"),
        }),
      },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.message ?? "Unable to create tenant access.");
    } else {
      event.currentTarget.reset();
      router.refresh();
    }
    setBusy(null);
  }

  async function mutate(
    user: TenantAccessUser,
    action: "toggle" | "activation" | "password",
  ) {
    setBusy(user.id + action);
    setError(null);
    const url =
      action === "activation"
        ? `/api/super-admin/tenants/${tenantId}/access-users/${user.id}/reset-activation`
        : action === "password"
          ? `/api/super-admin/tenants/${tenantId}/access-users/${user.id}/reset-password`
        : `/api/super-admin/tenants/${tenantId}/access-users/${user.id}`;
    const response = await fetch(url, {
      method: action === "toggle" ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body:
        action === "toggle"
          ? JSON.stringify({ active: user.status === "DISABLED" })
          : undefined,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.message ?? "Unable to update tenant access.");
    } else {
      router.refresh();
    }
    setBusy(null);
  }

  return (
    <div className="space-y-6">
      <form
        className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-5"
        onSubmit={createUser}
      >
        <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="firstName" placeholder="First name" required />
        <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="lastName" placeholder="Last name" required />
        <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="email" placeholder="Email" type="email" required />
        <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="accessType">
          <option value="GLOBAL_ADMIN">Global Admin</option>
          <option value="SERVICE_ACCOUNT">Service account</option>
        </select>
        <button className="rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={busy === "create"} type="submit">
          {busy === "create" ? "Creating..." : "Create access"}
        </button>
      </form>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <DataTable
        rows={users}
        rowKey={(user) => user.id}
        emptyTitle="No privileged tenant access"
        emptyDescription="Create a Global Admin or service account. Normal tenant users are intentionally excluded."
        columns={[
          {
            key: "identity",
            header: "User",
            render: (user) => (
              <div>
                <p className="font-semibold text-slate-950">{user.firstName} {user.lastName}</p>
                <p className="text-xs text-slate-500">{user.email}</p>
              </div>
            ),
          },
          { key: "type", header: "Access type", render: (user) => user.accessType === "GLOBAL_ADMIN" ? "Global Admin" : "Service account" },
          {
            key: "status",
            header: "Status",
            render: (user) => (
              <div>
                <TenantStatusBadge value={user.accessStatus} />
                {user.activation?.expiresAt ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Activation expires {formatDate(user.activation.expiresAt)}
                  </p>
                ) : null}
              </div>
            ),
          },
          { key: "login", header: "Last login", render: (user) => formatDate(user.lastLoginAt) },
          {
            key: "created",
            header: "Created",
            render: (user) => (
              <div>
                <p>{formatDate(user.createdAt)}</p>
                <p className="text-xs text-slate-500">
                  By {user.createdBy?.email ?? "System"}
                </p>
              </div>
            ),
          },
          {
            key: "actions",
            header: "Actions",
            align: "right",
            render: (user) => (
              <div className="flex justify-end gap-2">
                <button className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold" disabled={busy?.startsWith(user.id)} onClick={() => mutate(user, "activation")} type="button">
                  Send Activation Link
                </button>
                <button className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold" disabled={busy?.startsWith(user.id) || user.status === "DISABLED"} onClick={() => mutate(user, "password")} type="button">
                  Reset Password
                </button>
                <button className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold" disabled={busy?.startsWith(user.id)} onClick={() => mutate(user, "toggle")} type="button">
                  {user.status === "DISABLED" ? "Reactivate" : user.accessType === "SERVICE_ACCOUNT" ? "Revoke" : "Deactivate"}
                </button>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
