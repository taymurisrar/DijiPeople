"use client";

import { useCallback, useRef, useState } from "react";
import { PanelButton, PanelDialog } from "../tenants/tenant-panel-ui";

export type ConfirmActionRequest = {
  title: string;
  description: string;
  /**
   * What this action will actually bring into existence, named one per line.
   *
   * Required rather than optional, and deliberately so: the point of confirming
   * an irreversible create is that the operator reads what it creates. A dialog
   * that only says "Are you sure?" adds a click and no information, which trains
   * people to click through it.
   */
  creates: string[];
  confirmLabel: string;
  tone?: "default" | "danger";
};

type PendingConfirm = ConfirmActionRequest & {
  resolve: (confirmed: boolean) => void;
};

/**
 * Confirmation for an irreversible, billable create (BUG-0022).
 *
 * Provisioning a tenant produces a tenant, an owner invitation, a subscription
 * and a first invoice, and it was a single unconfirmed click. The same module
 * already requires a reason through `PanelDialog` for lifecycle *transitions* —
 * confirmation had been applied to changing a tenant and not to creating one.
 *
 * This is the front half of the fix and the weaker half: a dialog stops the
 * impatient second click, not a dropped response or a proxy retry. The half that
 * actually holds is the unique constraint on `Tenant.slug` plus the P2002
 * translation in `PlatformLifecycleService`, which makes a duplicated request
 * return the original tenant instead of a second one.
 */
export function useConfirmAction() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);

  const confirmAction = useCallback((request: ConfirmActionRequest) => {
    return new Promise<boolean>((resolve) => {
      pendingRef.current?.resolve(false);
      const next = { ...request, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const settle = useCallback((confirmed: boolean) => {
    pendingRef.current?.resolve(confirmed);
    pendingRef.current = null;
    setPending(null);
  }, []);

  const confirmDialog = pending ? (
    <PanelDialog
      title={pending.title}
      description={pending.description}
      tone={pending.tone ?? "default"}
      onClose={() => settle(false)}
      footer={
        <>
          <PanelButton onClick={() => settle(false)}>Cancel</PanelButton>
          <PanelButton variant="primary" onClick={() => settle(true)}>
            {pending.confirmLabel}
          </PanelButton>
        </>
      }
    >
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        This will create
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
        {pending.creates.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </PanelDialog>
  ) : null;

  return { confirmAction, confirmDialog };
}
