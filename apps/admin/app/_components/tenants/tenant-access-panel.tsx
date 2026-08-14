"use client";

import { useCallback, useState } from "react";
import {
  ProDataTable,
  type ProDataTableColumn,
} from "@/app/_components/crm/data-table";
import { formatDate } from "@/lib/formatters";
import {
  DialogField,
  PanelButton,
  PanelCard,
  PanelDialog,
  PanelEmptyState,
  PanelError,
  PanelLoading,
  StatePill,
  dialogInputClass,
  relativeTime,
} from "./tenant-panel-ui";
import {
  describeError,
  tenantRequest,
  useTenantResource,
  type TenantAccessView,
  type TenantIdentity,
} from "./tenant-control-plane.client";

type PendingAction =
  | { kind: "create"; identityType: "TENANT_OWNER" | "SERVICE_ACCOUNT" }
  | { kind: "confirm"; identity: TenantIdentity; action: ConfirmableAction }
  | { kind: "transfer"; target: TenantIdentity }
  | null;

type ConfirmableAction =
  | "disable"
  | "enable"
  | "password-reset"
  | "resend-invitation"
  | "rotate-credential"
  | "delete";

const CONFIRMATIONS: Record<
  ConfirmableAction,
  { title: string; description: string; cta: string; danger?: boolean }
> = {
  disable: {
    title: "Disable this account?",
    description:
      "Access is revoked immediately and live sessions are ended. The account and everything that references it are preserved, and it can be enabled again.",
    cta: "Disable account",
    danger: true,
  },
  enable: {
    title: "Enable this account?",
    description:
      "The holder regains access. An account that never completed activation returns to the invited state and must activate before signing in.",
    cta: "Enable account",
  },
  "password-reset": {
    title: "Send a password reset?",
    description:
      "DijiPeople sends a reset link through the authentication provider. Platform Admin never sees or sets the password — the Tenant Owner chooses their own.",
    cta: "Send reset",
  },
  "resend-invitation": {
    title: "Resend the activation invitation?",
    description:
      "A new single-use activation link is issued and emailed. Any previous invitation stops working.",
    cta: "Resend invitation",
  },
  "rotate-credential": {
    title: "Rotate this service credential?",
    description:
      "The current credential stops working immediately and every session using it is revoked. A new activation link is shown once and cannot be retrieved again.",
    cta: "Rotate credential",
    danger: true,
  },
  delete: {
    title: "Delete this account?",
    description:
      "Deletion removes the access identity. Prefer disabling, which keeps the account's historical references intact. Deletion is refused if tenant business records point at it.",
    cta: "Delete account",
    danger: true,
  },
};

/**
 * Access & Security.
 *
 * This is not a tenant user console. Platform Admin manages exactly two kinds of
 * identity here — the Tenant Owners who administer the workspace, and the
 * Service Accounts DijiPeople's own services authenticate as. Employees, HR
 * managers and ordinary application users are created inside the tenant product,
 * and the API refuses to express them through this surface at all.
 */
export function TenantAccessPanel({
  tenantId,
  requestedAction,
  onRequestHandled,
}: {
  tenantId: string;
  requestedAction?: "create-tenant-owner" | "create-service-account" | null;
  onRequestHandled?: () => void;
}) {
  const { data, loading, error, reload, setData } =
    useTenantResource<TenantAccessView>(tenantId, "/access");
  const [pending, setPending] = useState<PendingAction>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    text: string;
    secret?: { label: string; value: string };
  } | null>(null);

  /*
   * The action bar asks for a dialog by setting `requestedAction`. Deriving the
   * open dialog from it, rather than copying it into state inside an effect,
   * keeps a single source of truth and avoids a cascading render on every
   * request.
   */
  const activePending: PendingAction =
    pending ??
    (requestedAction
      ? {
          kind: "create",
          identityType:
            requestedAction === "create-service-account"
              ? "SERVICE_ACCOUNT"
              : "TENANT_OWNER",
        }
      : null);

  const closeDialog = useCallback(() => {
    setPending(null);
    onRequestHandled?.();
  }, [onRequestHandled]);

  const run = useCallback(
    async (work: () => Promise<unknown>, successMessage: string) => {
      try {
        const result = await work();
        setNotice({ tone: "success", text: successMessage });
        if (
          result &&
          typeof result === "object" &&
          "owners" in (result as Record<string, unknown>)
        ) {
          setData(result as TenantAccessView);
        } else {
          reload();
        }
        return result;
      } catch (reason) {
        setNotice({
          tone: "error",
          text: describeError(reason, "The action could not be completed."),
        });
        throw reason;
      }
    },
    [reload, setData],
  );

  if (loading && !data)
    return (
      <PanelCard title="Access & Security">
        <PanelLoading label="tenant access" />
      </PanelCard>
    );
  if (error && !data)
    return (
      <PanelCard title="Access & Security">
        <PanelError message={error} onRetry={reload} />
      </PanelCard>
    );
  if (!data) return null;

  const lastActiveOwner =
    data.activeOwnerCount <= 1
      ? data.owners.find((item) => item.isActive)?.id
      : undefined;

  return (
    <div className="space-y-5">
      {notice ? (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            notice.tone === "error"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          <p>{notice.text}</p>
          {notice.secret ? (
            <div className="mt-2 rounded-lg border border-emerald-300 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {notice.secret.label} — shown once
              </p>
              <code className="mt-1 block break-all font-mono text-xs text-slate-800">
                {notice.secret.value}
              </code>
            </div>
          ) : null}
        </div>
      ) : null}

      <PanelCard
        title="Tenant Owners"
        description="People who administer this workspace on the customer's behalf. Employees and other tenant users are managed inside the tenant application."
        actions={
          <PanelButton
            variant="primary"
            onClick={() =>
              setPending({ kind: "create", identityType: "TENANT_OWNER" })
            }
          >
            Create Tenant Owner
          </PanelButton>
        }
      >
        {data.owners.length ? (
          <ProDataTable
            rows={data.owners}
            rowKey={(row) => row.id}
            compact
            columns={identityColumns({
              isServiceAccount: false,
              lastActiveOwnerId: lastActiveOwner,
              onAction: (identity, action) =>
                setPending({ kind: "confirm", identity, action }),
              onTransfer: (identity) =>
                setPending({ kind: "transfer", target: identity }),
              canTransfer: data.owners.filter((item) => item.isActive).length > 1,
            })}
          />
        ) : (
          <PanelEmptyState
            title="No Tenant Owner has been assigned."
            description="A workspace without an active Tenant Owner cannot be administered by its customer, and cannot be activated."
            action={
              <PanelButton
                variant="primary"
                onClick={() =>
                  setPending({ kind: "create", identityType: "TENANT_OWNER" })
                }
              >
                Create Tenant Owner
              </PanelButton>
            }
          />
        )}
      </PanelCard>

      <PanelCard
        title="Service Accounts"
        description="Non-human identities used by DijiPeople services — the attendance gateway, desktop agent integrations and background workloads."
        actions={
          <PanelButton
            onClick={() =>
              setPending({ kind: "create", identityType: "SERVICE_ACCOUNT" })
            }
          >
            Create Service Account
          </PanelButton>
        }
      >
        {data.serviceAccounts.length ? (
          <ProDataTable
            rows={data.serviceAccounts}
            rowKey={(row) => row.id}
            compact
            columns={identityColumns({
              isServiceAccount: true,
              onAction: (identity, action) =>
                setPending({ kind: "confirm", identity, action }),
            })}
          />
        ) : (
          <PanelEmptyState
            title="No service accounts have been created for this tenant."
            description="Create one when a DijiPeople service needs to authenticate against this workspace on its own behalf."
            action={
              <PanelButton
                onClick={() =>
                  setPending({
                    kind: "create",
                    identityType: "SERVICE_ACCOUNT",
                  })
                }
              >
                Create Service Account
              </PanelButton>
            }
          />
        )}
      </PanelCard>

      {activePending?.kind === "create" ? (
        <CreateIdentityDialog
          identityType={activePending.identityType}
          onClose={closeDialog}
          onSubmit={async (values) => {
            const result = await run(
              () =>
                tenantRequest<{
                  activationLink: string;
                  activationExpiresAt: string;
                }>(tenantId, "/access", {
                  method: "POST",
                  body: JSON.stringify(values),
                }),
              `${values.identityType === "TENANT_OWNER" ? "Tenant Owner" : "Service account"} created and invited.`,
            );
            const link = (result as { activationLink?: string } | undefined)
              ?.activationLink;
            if (link) {
              setNotice({
                tone: "success",
                text: "Created. The activation link below is shown once — the holder sets their own password through it.",
                secret: { label: "Activation link", value: link },
              });
            }
            closeDialog();
          }}
        />
      ) : null}

      {activePending?.kind === "confirm" ? (
        <ConfirmIdentityDialog
          identity={activePending.identity}
          action={activePending.action}
          onClose={closeDialog}
          onConfirm={async (reason) => {
            const { identity, action } = activePending;
            if (action === "disable" || action === "enable") {
              await run(
                () =>
                  tenantRequest<TenantAccessView>(
                    tenantId,
                    `/access/${identity.id}`,
                    {
                      method: "PATCH",
                      body: JSON.stringify({
                        isEnabled: action === "enable",
                      }),
                    },
                  ),
                action === "enable" ? "Account enabled." : "Account disabled.",
              );
            } else if (action === "delete") {
              await run(
                () =>
                  tenantRequest<TenantAccessView>(
                    tenantId,
                    `/access/${identity.id}`,
                    {
                      method: "DELETE",
                      body: JSON.stringify({ reason }),
                    },
                  ),
                "Account deleted.",
              );
            } else {
              const endpoint =
                action === "password-reset"
                  ? "password-reset"
                  : action === "resend-invitation"
                    ? "resend-invitation"
                    : "rotate-credential";
              const result = await run(
                () =>
                  tenantRequest<{
                    message: string;
                    activationLink?: string;
                  }>(tenantId, `/access/${identity.id}/${endpoint}`, {
                    method: "POST",
                    body: JSON.stringify({}),
                  }),
                "Done.",
              );
              const payload = result as {
                message?: string;
                activationLink?: string;
              };
              setNotice({
                tone: "success",
                text: payload.message ?? "Done.",
                secret:
                  action === "rotate-credential" && payload.activationLink
                    ? {
                        label: "New activation link",
                        value: payload.activationLink,
                      }
                    : undefined,
              });
            }
            closeDialog();
          }}
        />
      ) : null}

      {activePending?.kind === "transfer" ? (
        <TransferOwnershipDialog
          target={activePending.target}
          current={data.owners.find((item) => item.isPrimaryOwner) ?? null}
          onClose={closeDialog}
          onSubmit={async (toUserId, reason) => {
            await run(
              () =>
                tenantRequest<TenantAccessView>(
                  tenantId,
                  "/access/transfer-ownership",
                  {
                    method: "POST",
                    body: JSON.stringify({ toUserId, reason }),
                  },
                ),
              "Primary ownership transferred.",
            );
            closeDialog();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Columns carry the values an operator needs to decide something. The previous
 * table showed a dash, a raw status and a date, which answered nothing.
 */
function identityColumns(options: {
  isServiceAccount: boolean;
  lastActiveOwnerId?: string;
  canTransfer?: boolean;
  onAction: (identity: TenantIdentity, action: ConfirmableAction) => void;
  onTransfer?: (identity: TenantIdentity) => void;
}): ProDataTableColumn<TenantIdentity>[] {
  const base: ProDataTableColumn<TenantIdentity>[] = [
    {
      key: "name",
      header: options.isServiceAccount ? "Service account" : "Name",
      minWidth: 200,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{row.fullName}</p>
          <p className="truncate text-xs text-slate-500">{row.email}</p>
        </div>
      ),
    },
    {
      key: "type",
      header: options.isServiceAccount ? "Purpose" : "Account type",
      minWidth: 150,
      render: (row) =>
        options.isServiceAccount ? (
          (row.purpose ?? <span className="text-slate-400">Not described</span>)
        ) : (
          <span>
            {row.isPrimaryOwner ? "Primary Tenant Owner" : "Tenant Owner"}
          </span>
        ),
    },
    {
      key: "status",
      header: "Status",
      minWidth: 130,
      render: (row) => (
        <StatePill
          value={row.status}
          tone={
            row.status === "ACTIVE"
              ? "success"
              : row.status === "DISABLED"
                ? "danger"
                : "warning"
          }
        />
      ),
    },
    {
      key: "invitation",
      header: options.isServiceAccount ? "Credential" : "Invitation",
      minWidth: 150,
      render: (row) => (
        <div>
          <p className="text-xs font-medium text-slate-700">
            {row.invitationStatus}
          </p>
          {row.invitationExpiresAt && row.invitationStatus.includes("pending") ? (
            <p className="text-[11px] text-slate-500">
              Expires {formatDate(row.invitationExpiresAt)}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "lastSignIn",
      header: options.isServiceAccount ? "Last used" : "Last sign-in",
      minWidth: 140,
      render: (row) => (
        <span className="text-xs text-slate-600">
          {relativeTime(row.lastSignInAt)}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "Created",
      minWidth: 150,
      render: (row) => (
        <div>
          <p className="text-xs text-slate-700">{formatDate(row.createdAt)}</p>
          {row.createdByName ? (
            <p className="text-[11px] text-slate-500">by {row.createdByName}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      minWidth: 260,
      render: (row) => {
        const isLastActiveOwner = options.lastActiveOwnerId === row.id;
        return (
          <div className="flex flex-wrap gap-1.5">
            {row.isActive ? (
              <PanelButton
                onClick={() => options.onAction(row, "disable")}
                disabled={isLastActiveOwner}
                title={
                  isLastActiveOwner
                    ? "This is the last active Tenant Owner."
                    : undefined
                }
              >
                Disable
              </PanelButton>
            ) : (
              <PanelButton onClick={() => options.onAction(row, "enable")}>
                Enable
              </PanelButton>
            )}
            {options.isServiceAccount ? (
              <PanelButton
                onClick={() => options.onAction(row, "rotate-credential")}
              >
                Rotate credential
              </PanelButton>
            ) : (
              <>
                <PanelButton
                  onClick={() => options.onAction(row, "password-reset")}
                  disabled={!row.isActive}
                  title={
                    row.isActive
                      ? undefined
                      : "Enable the account before sending a reset."
                  }
                >
                  Send password reset
                </PanelButton>
                {options.canTransfer && !row.isPrimaryOwner ? (
                  <PanelButton onClick={() => options.onTransfer?.(row)}>
                    Make primary
                  </PanelButton>
                ) : null}
              </>
            )}
            <PanelButton onClick={() => options.onAction(row, "resend-invitation")}>
              Resend invite
            </PanelButton>
            <PanelButton
              variant="danger"
              onClick={() => options.onAction(row, "delete")}
              disabled={isLastActiveOwner || row.isPrimaryOwner}
              title={
                row.isPrimaryOwner
                  ? "Transfer primary ownership before deleting this account."
                  : isLastActiveOwner
                    ? "This is the last active Tenant Owner."
                    : undefined
              }
            >
              Delete
            </PanelButton>
          </div>
        );
      },
    },
  ];
  return base;
}

function CreateIdentityDialog({
  identityType,
  onClose,
  onSubmit,
}: {
  identityType: "TENANT_OWNER" | "SERVICE_ACCOUNT";
  onClose: () => void;
  onSubmit: (values: {
    identityType: string;
    firstName: string;
    lastName?: string;
    email: string;
    purpose?: string;
  }) => Promise<void>;
}) {
  const isOwner = identityType === "TENANT_OWNER";
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);

  const valid = firstName.trim() && email.trim() && (!isOwner || lastName.trim());

  return (
    <PanelDialog
      title={isOwner ? "Create Tenant Owner" : "Create Service Account"}
      description={
        isOwner
          ? "The new owner receives an activation link and sets their own password. No password is chosen here."
          : "A machine identity for a DijiPeople service. The activation link is shown once when it is created."
      }
      onClose={onClose}
      footer={
        <>
          <PanelButton onClick={onClose}>Cancel</PanelButton>
          <PanelButton
            variant="primary"
            busy={busy}
            disabled={!valid}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit({
                  identityType,
                  firstName: firstName.trim(),
                  ...(isOwner ? { lastName: lastName.trim() } : {}),
                  email: email.trim(),
                  ...(purpose.trim() && !isOwner
                    ? { purpose: purpose.trim() }
                    : {}),
                });
              } finally {
                setBusy(false);
              }
            }}
          >
            {isOwner ? "Create and invite" : "Create service account"}
          </PanelButton>
        </>
      }
    >
      <DialogField label={isOwner ? "First name" : "Service name"} required>
        <input
          className={dialogInputClass}
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          placeholder={isOwner ? "Aisha" : "Attendance Gateway"}
        />
      </DialogField>
      {isOwner ? (
        <DialogField label="Last name" required>
          <input
            className={dialogInputClass}
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
        </DialogField>
      ) : null}
      <DialogField
        label="Work email"
        required
        hint="Must be unique within this tenant. The activation link is sent here."
      >
        <input
          type="email"
          className={dialogInputClass}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </DialogField>
      {!isOwner ? (
        <DialogField
          label="Purpose"
          hint="What this identity is used for, so a later operator knows whether it is safe to disable."
        >
          <input
            className={dialogInputClass}
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
            placeholder="Attendance device synchronisation"
          />
        </DialogField>
      ) : null}
    </PanelDialog>
  );
}

function ConfirmIdentityDialog({
  identity,
  action,
  onClose,
  onConfirm,
}: {
  identity: TenantIdentity;
  action: ConfirmableAction;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const config = CONFIRMATIONS[action];
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const needsReason = action === "delete";

  return (
    <PanelDialog
      title={config.title}
      description={config.description}
      tone={config.danger ? "danger" : "default"}
      onClose={onClose}
      footer={
        <>
          <PanelButton onClick={onClose}>Cancel</PanelButton>
          <PanelButton
            variant={config.danger ? "danger" : "primary"}
            busy={busy}
            disabled={needsReason && reason.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(reason.trim());
              } finally {
                setBusy(false);
              }
            }}
          >
            {config.cta}
          </PanelButton>
        </>
      }
    >
      <p className="text-sm text-slate-700">
        <span className="font-semibold">{identity.fullName}</span>
        <span className="block text-xs text-slate-500">{identity.email}</span>
      </p>
      {needsReason ? (
        <DialogField label="Reason" required>
          <textarea
            rows={3}
            className={`${dialogInputClass} h-auto py-2`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Recorded in the platform audit log."
          />
        </DialogField>
      ) : null}
    </PanelDialog>
  );
}

function TransferOwnershipDialog({
  target,
  current,
  onClose,
  onSubmit,
}: {
  target: TenantIdentity;
  current: TenantIdentity | null;
  onClose: () => void;
  onSubmit: (toUserId: string, reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <PanelDialog
      title="Transfer primary ownership"
      description="Primary ownership moves to another active Tenant Owner. Machine identities and employee accounts are not eligible."
      onClose={onClose}
      footer={
        <>
          <PanelButton onClick={onClose}>Cancel</PanelButton>
          <PanelButton
            variant="primary"
            busy={busy}
            disabled={reason.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit(target.id, reason.trim());
              } finally {
                setBusy(false);
              }
            }}
          >
            Transfer ownership
          </PanelButton>
        </>
      }
    >
      <p className="text-sm text-slate-700">
        {current ? (
          <>
            Primary ownership moves from{" "}
            <span className="font-semibold">{current.fullName}</span> to{" "}
          </>
        ) : (
          <>Primary ownership is assigned to </>
        )}
        <span className="font-semibold">{target.fullName}</span>
        <span className="block text-xs text-slate-500">{target.email}</span>
      </p>
      <DialogField label="Reason" required>
        <textarea
          rows={3}
          className={`${dialogInputClass} h-auto py-2`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </DialogField>
    </PanelDialog>
  );
}
