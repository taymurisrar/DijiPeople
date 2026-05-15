"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { EmployeeListItem } from "../types";

type EmployeeAccessCardProps = {
  canManageAccess: boolean;
  employee: EmployeeListItem;
};

export function EmployeeAccessCard({
  canManageAccess,
  employee,
}: EmployeeAccessCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const accessStatus = !employee.user
    ? "No access"
    : employee.user.status === "INVITED"
      ? "Invited"
      : employee.user.status === "Active"
        ? "Active"
        : "Suspended";

  function handleInvite(mode: "provision" | "resend") {
    setMessage(null);

    startTransition(async () => {
      const response = await fetch(
        mode === "provision"
          ? `/api/employees/${employee.id}/provision-access`
          : `/api/employees/${employee.id}/resend-invite`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body:
            mode === "provision"
              ? JSON.stringify({
                  provisionSystemAccess: true,
                  sendInvitationNow: true,
                  initialRoleIds: employee.user?.roles.map((role) => role.id) ?? [],
                })
              : undefined,
        },
      );

      const payload = (await response.json().catch(() => null)) as
        | {
            message?: string;
            access?: {
              invitation?: {
                activationLink?: string;
                deliveryMode: string;
              } | null;
            };
          }
        | null;

      if (!response.ok) {
        setMessage(payload?.message ?? "Unable to send the invitation.");
        return;
      }

      const devLink = payload?.access?.invitation?.activationLink;
      setMessage(
        devLink
          ? `Invitation created. Dev activation link: ${devLink}`
          : "Invitation created successfully.",
      );
      router.refresh();
    });
  }

  return (
    <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <p className="text-sm uppercase tracking-[0.18em] text-muted">
        System Access
      </p>
      <div className="mt-4 grid gap-3 text-sm text-muted">
        <p>Status: <span className="font-medium text-foreground">{accessStatus}</span></p>
        <p>Work email: <span className="font-medium text-foreground">{employee.workEmail || "Not set"}</span></p>
        <p>
          Roles:{" "}
          <span className="font-medium text-foreground">
            {employee.user?.roles?.length
            ? employee.user.roles.map((role) => role.name).join(", ")
            : "No linked roles"}
          </span>
        </p>
      </div>

      {canManageAccess ? (
        <div className="mt-5 flex flex-wrap gap-3">
          {!employee.user ? (
            <button
              className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70"
              disabled={isPending || !employee.workEmail}
              onClick={() => handleInvite("provision")}
              type="button"
            >
              {isPending ? "Sending..." : "Invite to platform"}
            </button>
          ) : employee.user.status === "INVITED" ? (
            <button
              className="rounded-2xl border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent disabled:opacity-70"
              disabled={isPending || !employee.workEmail}
              onClick={() => handleInvite("resend")}
              type="button"
            >
              {isPending ? "Sending..." : "Resend invitation"}
            </button>
          ) : (
            <span className="rounded-2xl border border-border bg-white/80 px-4 py-3 text-sm text-muted">
              Account is already active.
            </span>
          )}
        </div>
      ) : null}

      {!employee.workEmail ? (
        <p className="mt-4 text-xs text-muted">
          Add a work email before provisioning login access.
        </p>
      ) : null}

      {message ? (
        <p className="mt-4 rounded-2xl border border-border bg-white/80 px-4 py-3 text-xs text-muted">
          {message}
        </p>
      ) : null}
    </article>
  );
}
