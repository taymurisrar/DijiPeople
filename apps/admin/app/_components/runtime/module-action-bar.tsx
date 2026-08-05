"use client";

import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleX,
  Download,
  Edit3,
  FileSignature,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  UserRoundCheck,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { RuntimeActionDefinition } from "@/lib/runtime/platform-runtime.types";

export type ModuleActionContext = {
  scope: "list" | "record";
  selectedIds?: string[];
  record?: Record<string, unknown>;
  roleKeys?: string[];
  permissionKeys?: string[];
  isDirty?: boolean;
  mode?: "create" | "read" | "edit";
};
export type ModuleActionHandler = (
  action: RuntimeActionDefinition,
  context: ModuleActionContext,
) => Promise<{ success?: boolean; message?: string } | void> | void;

export function ModuleActionBar({
  actions,
  context,
  onAction,
  statusSlot,
  className,
}: {
  actions: RuntimeActionDefinition[];
  context: ModuleActionContext;
  onAction: ModuleActionHandler;
  statusSlot?: React.ReactNode;
  className?: string;
}) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] =
    useState<RuntimeActionDefinition | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const overflowRef = useRef<HTMLDivElement | null>(null);
  const available = useMemo(
    () => actions.filter((action) => isVisible(action, context)),
    [actions, context],
  );
  const primary = available.filter(
    (action) => (action.placement ?? "secondary") !== "overflow",
  );
  const overflow = available.filter(
    (action) => action.placement === "overflow",
  );
  useEffect(() => {
    if (!overflowOpen) return;
    const close = (event: PointerEvent) => {
      if (
        overflowRef.current &&
        !overflowRef.current.contains(event.target as Node)
      )
        setOverflowOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [overflowOpen]);
  function execute(action: RuntimeActionDefinition) {
    if (action.destructive && !confirmAction) {
      setConfirmAction(action);
      return;
    }
    setConfirmAction(null);
    setOverflowOpen(false);
    setPendingKey(action.key);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await onAction(action, context);
        setNotice(
          result?.message ??
            (result?.success === false
              ? "Action could not be completed."
              : null),
        );
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "Action could not be completed.",
        );
      } finally {
        setPendingKey(null);
      }
    });
  }
  return (
    <>
      <div
        className={`sticky top-0 z-30 flex min-h-14 flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur ${className ?? ""}`}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {primary.map((action) => (
            <ActionButton
              key={action.key}
              action={action}
              busy={isPending && pendingKey === action.key}
              disabledReason={disabledReason(action, context)}
              onClick={() => execute(action)}
            />
          ))}
          {overflow.length ? (
            <div className="relative" ref={overflowRef}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={overflowOpen}
                onClick={() => setOverflowOpen((value) => !value)}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                <MoreHorizontal className="h-4 w-4" />
                More
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {overflowOpen ? (
                <div
                  role="menu"
                  className="absolute left-0 top-[calc(100%+6px)] z-50 min-w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
                >
                  {overflow.map((action) => (
                    <button
                      role="menuitem"
                      key={action.key}
                      type="button"
                      title={disabledReason(action, context) ?? undefined}
                      disabled={Boolean(disabledReason(action, context))}
                      onClick={() => execute(action)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${action.destructive ? "text-rose-700 hover:bg-rose-50" : "text-slate-700 hover:bg-slate-50"}`}
                    >
                      {iconFor(action.key)}
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {notice ? (
            <span
              role="status"
              className={`text-xs font-medium ${notice.includes("could not") || notice.includes("Unable") ? "text-rose-600" : "text-emerald-700"}`}
            >
              {notice}
            </span>
          ) : null}
          {statusSlot}
        </div>
      </div>
      {confirmAction ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="runtime-confirm-title"
          className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/40 p-4"
        >
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-700">
              <Trash2 className="h-5 w-5" />
            </div>
            <h2
              id="runtime-confirm-title"
              className="mt-4 text-lg font-semibold text-slate-950"
            >
              {confirmAction.confirmTitle ?? "Confirm action"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {confirmAction.confirmDescription ??
                "This action may not be reversible."}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => execute(confirmAction)}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ActionButton({
  action,
  busy,
  disabledReason: reason,
  onClick,
}: {
  action: RuntimeActionDefinition;
  busy: boolean;
  disabledReason: string | null;
  onClick: () => void;
}) {
  const primary = action.placement === "primary";
  return (
    <button
      type="button"
      disabled={Boolean(reason) || busy}
      title={reason ?? undefined}
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${primary ? "bg-slate-950 text-white hover:bg-slate-800" : action.destructive ? "border border-rose-200 text-rose-700 hover:bg-rose-50" : "border border-slate-200 text-slate-700 hover:bg-slate-50"}`}
    >
      {busy ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : (
        iconFor(action.key)
      )}
      {action.label}
    </button>
  );
}
function isVisible(
  action: RuntimeActionDefinition,
  context: ModuleActionContext,
) {
  if (action.scope !== "both" && action.scope !== context.scope) return false;
  if (
    action.roles?.length &&
    !action.roles.some((role) => context.roleKeys?.includes(role))
  )
    return false;
  if (
    action.permission &&
    !context.permissionKeys?.some((granted) =>
      permissionMatches(granted, action.permission!),
    ) &&
    !context.roleKeys?.some((role) =>
      ["PLATFORM_OWNER", "PLATFORM_ADMIN", "SUPER_ADMIN"].includes(role),
    )
  )
    return false;
  if (
    action.states?.length &&
    !action.states.includes(String(context.record?.status ?? ""))
  )
    return false;
  const count = context.selectedIds?.length ?? 0;
  if (action.selection === "one" && count !== 1) return false;
  if (action.selection === "many" && count < 2) return false;
  if (action.selection === "any" && count < 1) return false;
  if (action.selection === "none" && count > 0) return false;
  return true;
}
function permissionMatches(granted: string, requested: string) {
  if (granted === "platform.*" || granted === requested) return true;
  return granted.endsWith(".*") && requested.startsWith(granted.slice(0, -1));
}
function disabledReason(
  action: RuntimeActionDefinition,
  context: ModuleActionContext,
) {
  if (action.disabledReason) return action.disabledReason;
  if (
    (action.key === "save" || action.key === "save-close") &&
    context.mode === "read"
  )
    return "Open edit mode before saving.";
  if (
    (action.key === "save" || action.key === "save-close") &&
    context.mode === "edit" &&
    !context.isDirty
  )
    return "No changes to save.";
  return null;
}
function iconFor(key: string) {
  const Icon =
    key === "back"
      ? ArrowLeft
      : key === "new"
        ? Plus
        : key === "edit"
          ? Edit3
          : key === "save" || key === "save-close"
            ? Save
            : key.includes("delete")
              ? Trash2
              : key === "refresh"
                ? RefreshCw
                : key === "export"
                  ? Download
                  : key === "send" ||
                      key === "resend" ||
                      key === "send-signature"
                    ? Send
                    : key === "approve" || key === "activate"
                      ? UserRoundCheck
                      : key === "reject" || key === "deactivate"
                        ? CircleX
                        : key === "generate-document"
                          ? FileSignature
                          : Check;
  return <Icon className="h-4 w-4" />;
}
