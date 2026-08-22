"use client";

import { useCallback, useMemo, useState } from "react";
import type { RuntimeActionDefinition } from "@/lib/runtime/platform-runtime.types";
import { openExternal } from "@/lib/open-external";
import { buildTenantLoginUrl } from "@/lib/tenant-url";
import {
  DialogField,
  PanelButton,
  PanelDialog,
  dialogInputClass,
} from "./tenant-panel-ui";
import { ReadinessCard } from "./tenant-overview-panel";
import {
  describeError,
  tenantRequest,
  type TenantReadiness,
} from "./tenant-control-plane.client";

/** Tabs whose content comes from a tenant panel rather than from form fields. */
export const TENANT_PANEL_TABS = [
  "overview",
  "configuration",
  "access-security",
  "commercial",
  "apps-modules",
  "operations",
  "timeline",
  "system",
];

type LifecycleAction = {
  key: string;
  status: string;
  title: string;
  description: string;
  cta: string;
  danger?: boolean;
};

/**
 * Lifecycle moves the action menu can request, and the status each one asks for.
 *
 * Every one carries a reason: suspension and decommissioning are visible to the
 * customer, and an unexplained state change is not something anyone can defend
 * later. The API enforces the same transition map, so a request for a move that
 * is invalid from the tenant's current state is refused there too.
 */
const LIFECYCLE_ACTIONS: Record<string, LifecycleAction> = {
  "suspend-tenant": {
    key: "suspend-tenant",
    status: "SUSPENDED",
    title: "Suspend this tenant",
    description:
      "Tenant users lose access immediately and live sessions are revoked. Data, subscription and history are preserved, and the tenant can be reactivated at any time.",
    cta: "Suspend tenant",
    danger: true,
  },
  "reactivate-tenant": {
    key: "reactivate-tenant",
    status: "ACTIVE",
    title: "Reactivate this tenant",
    description:
      "Tenant users regain access. The workspace must still have at least one active Tenant Owner.",
    cta: "Reactivate tenant",
  },
  "activate-tenant": {
    key: "activate-tenant",
    status: "ACTIVE",
    title: "Activate this tenant",
    description:
      "The workspace becomes live for its customer. At least one active Tenant Owner is required.",
    cta: "Activate tenant",
  },
  "decommission-tenant": {
    key: "decommission-tenant",
    status: "DECOMMISSIONING",
    title: "Start decommissioning this tenant",
    description:
      "The workspace is retired according to the termination process. Data is preserved — this is not erasure, and it can be reversed by reactivating the tenant.",
    cta: "Start decommissioning",
    danger: true,
  },
};

type HandleContext = {
  record: Record<string, unknown>;
  goToTab: (tab: string) => void;
  reloadRecord: () => Promise<void>;
};

/**
 * Routes tenant action-bar requests to whichever surface owns the change.
 *
 * Actions that need a reason or a confirmation open a dialog here; actions that
 * belong to a tab (create an owner, retry provisioning, erase) hand the request
 * to that tab's panel, which owns the data and can refresh itself afterwards.
 */
export function useTenantRecordActions(tenantId: string | null) {
  const [lifecycle, setLifecycle] = useState<LifecycleAction | null>(null);
  const [readiness, setReadiness] = useState<TenantReadiness | null>(null);
  const [accessRequest, setAccessRequest] = useState<
    "create-tenant-owner" | "create-service-account" | null
  >(null);
  const [retryRequested, setRetryRequested] = useState(false);
  const [eraseRequested, setEraseRequested] = useState(false);
  const [context, setContext] = useState<HandleContext | null>(null);

  const handleAction = useCallback(
    async (
      action: RuntimeActionDefinition,
      handleContext: HandleContext,
    ): Promise<{ result: { success: boolean; message?: string } } | null> => {
      if (!tenantId) return null;
      setContext(handleContext);

      if (action.key === "open-tenant") {
        const slug = String(handleContext.record.slug ?? "").trim();
        if (!slug) {
          /*
           * A tenant with no slug has no workspace address, and opening the
           * fallback would land the operator on the admin app's own login. Say
           * so rather than opening something and calling it the workspace.
           */
          return {
            result: {
              success: false,
              message:
                "This tenant has no workspace slug, so there is no workspace to open. Set one on Configuration.",
            },
          };
        }
        /*
         * This reported "Tenant workspace opened." unconditionally, while
         * passing a features string that makes Chrome treat the call as a popup
         * request — commonly blocked, silently. The button appeared to do
         * nothing and the toast said it had worked.
         */
        const opened = openExternal(
          buildTenantLoginUrl(slug),
          "The tenant workspace",
        );
        return {
          result: { success: opened.opened, message: opened.message },
        };
      }

      if (action.key === "validate-tenant") {
        const result = await tenantRequest<TenantReadiness>(
          tenantId,
          "/readiness",
        );
        setReadiness(result);
        return {
          result: {
            success: true,
            message:
              result.status === "READY"
                ? "Tenant is ready."
                : result.status === "WARNINGS"
                  ? `${result.warningCount} warning(s).`
                  : `Blocked by ${result.blockerCount} issue(s).`,
          },
        };
      }

      if (LIFECYCLE_ACTIONS[action.key]) {
        setLifecycle(LIFECYCLE_ACTIONS[action.key]!);
        return { result: { success: true } };
      }

      if (
        action.key === "create-tenant-owner" ||
        action.key === "create-service-account"
      ) {
        handleContext.goToTab("access-security");
        setAccessRequest(action.key);
        return { result: { success: true } };
      }

      if (action.key === "retry-provisioning") {
        handleContext.goToTab("operations");
        setRetryRequested(true);
        return { result: { success: true } };
      }

      if (action.key === "refresh-tenant") {
        await handleContext.reloadRecord();
        return {
          result: { success: true, message: "Tenant state refreshed." },
        };
      }

      if (action.key === "erase-tenant") {
        handleContext.goToTab("system");
        setEraseRequested(true);
        return { result: { success: true } };
      }

      return null;
    },
    [tenantId],
  );

  const dialog = useMemo(() => {
    if (readiness) {
      return (
        <PanelDialog
          title="Tenant readiness"
          description="Deterministic checks against the records this platform holds."
          wide
          onClose={() => setReadiness(null)}
          footer={
            <PanelButton onClick={() => setReadiness(null)}>Close</PanelButton>
          }
        >
          <ReadinessCard readiness={readiness} />
        </PanelDialog>
      );
    }
    if (lifecycle && tenantId) {
      return (
        <LifecycleDialog
          action={lifecycle}
          tenantId={tenantId}
          onClose={() => setLifecycle(null)}
          onDone={async () => {
            setLifecycle(null);
            await context?.reloadRecord();
          }}
        />
      );
    }
    return null;
  }, [readiness, lifecycle, tenantId, context]);

  return {
    handleAction,
    dialog,
    accessRequest,
    clearAccessRequest: useCallback(() => setAccessRequest(null), []),
    retryRequested,
    clearRetryRequest: useCallback(() => setRetryRequested(false), []),
    eraseRequested,
    clearEraseRequest: useCallback(() => setEraseRequested(false), []),
  };
}

function LifecycleDialog({
  action,
  tenantId,
  onClose,
  onDone,
}: {
  action: LifecycleAction;
  tenantId: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <PanelDialog
      title={action.title}
      description={action.description}
      tone={action.danger ? "danger" : "default"}
      onClose={onClose}
      footer={
        <>
          <PanelButton onClick={onClose}>Cancel</PanelButton>
          <PanelButton
            variant={action.danger ? "danger" : "primary"}
            busy={busy}
            disabled={reason.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await tenantRequest(tenantId, "/status", {
                  method: "POST",
                  body: JSON.stringify({
                    status: action.status,
                    reason: reason.trim(),
                  }),
                });
                await onDone();
              } catch (reason_) {
                setError(
                  describeError(
                    reason_,
                    "The lifecycle change could not be completed.",
                  ),
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {action.cta}
          </PanelButton>
        </>
      }
    >
      <DialogField
        label="Reason"
        required
        hint="Recorded on the tenant timeline and in the platform audit log."
      >
        <textarea
          rows={3}
          className={`${dialogInputClass} h-auto py-2`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </DialogField>
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
        >
          {error}
        </p>
      ) : null}
    </PanelDialog>
  );
}
