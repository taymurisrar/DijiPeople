"use client";

import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleX,
  Download,
  Edit3,
  FileSignature,
  Handshake,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  UserRoundPlus,
  UserRoundCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  RecordDependencyReport,
  RuntimeActionDefinition,
} from "@/lib/runtime/platform-runtime.types";
import { hasRuntimePermission } from "@/lib/runtime/runtime-permissions";
import { commandMatchesRecord } from "@/lib/runtime/command-visibility";
import { describeActionNotice } from "@/lib/runtime/runtime-action-outcome";
import {
  describeDestructiveConfirm,
  recordDisplayName,
} from "@/lib/runtime/destructive-confirm";
import { fitCommands, orderCommands } from "@/lib/runtime/command-overflow";
import { DependencyAwareDeleteDialog } from "./dependency-aware-delete-dialog";

/** Matches `gap-1` between command buttons. */
const COMMAND_GAP_PX = 4;
/*
 * useLayoutEffect measures before the browser paints, so an overflowing bar is
 * never shown with its last buttons clipped for a frame. It does nothing on the
 * server, where there is nothing to measure.
 */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export type ModuleActionContext = {
  scope: "list" | "record";
  selectedIds?: string[];
  /*
   * Display names for the selection, so a destructive confirmation can say what
   * it is about to delete. Ids alone told the operator nothing — the bulk
   * dialog read "Delete selected records?" with no count and no names
   * (BUG-1756, BUG-1560).
   */
  selectedLabels?: string[];
  /** What this module calls one record and many, for the same dialog. */
  displayName?: string;
  pluralDisplayName?: string;
  record?: Record<string, unknown>;
  /** The record's id, for record scope — form values need not carry it. */
  recordId?: string;
  roleKeys?: string[];
  permissionKeys?: string[];
  isDirty?: boolean;
  mode?: "create" | "read" | "edit";
  /*
   * The selection as id and name pairs, in selection order. `selectedLabels`
   * is filtered to names that resolved, so it cannot be zipped with the ids.
   */
  selectedTargets?: Array<{ id: string; label: string }>;
  /*
   * Asks the API what deleting a record would do (EXECPLAN-0055 D5). When set,
   * Delete and Bulk delete confirm through `DependencyAwareDeleteDialog`, which
   * shows what blocks the delete and what goes with it before the operator
   * confirms. Resolving null for a record means the module has no provider,
   * and the dialog is the plain confirmation.
   */
  getDependencies?: (id: string) => Promise<RecordDependencyReport | null>;
};
export type ModuleActionHandler = (
  action: RuntimeActionDefinition,
  context: ModuleActionContext,
) => Promise<{ success?: boolean; message?: string } | void> | void;

/**
 * The command bar every admin list and record screen draws its buttons in.
 *
 * **This component does not decide which buttons exist.** It renders the
 * `actions` it is handed, and those come from the module registry — `define()`
 * merges a module's declared actions over the defaults its `capabilities` map
 * earns, then force-sorts the standard six into one fixed order so Delete does
 * not lead the bar on one module and trail it on another. A button that should
 * appear and does not is almost always a registry or capability question, not
 * a question about this file. See `.agent/context/runtime-module-system.md`
 * and `withDefaultActions()` in `lib/runtime/platform-module-registry.ts`.
 *
 * What this component owns is everything downstream of that list:
 *
 * - **Visibility** (`isVisible`) — scope, role, permission, record status and
 *   selection count, all five of which must pass. This is UX gating only; the
 *   API is the authority, and an action hidden here is not an action refused.
 * - **Placement** — every command is drawn inline while the bar has room for
 *   it. When it does not, the lowest-priority commands move into More (see
 *   `fitCommands`), and come back when the bar widens. More exists only when
 *   something is actually in it. `placement: "overflow"` now means "first to
 *   leave", not "always hidden"; `placement: "primary"` means "last to leave",
 *   and is the one emphasised button.
 * - **Confirmation** — a `destructive` action routes through a confirm dialog
 *   before `onAction` is ever called, so a handler cannot skip it by accident.
 * - **Pending and result state** — one action at a time, with the outcome
 *   surfaced as a notice rather than swallowed.
 *
 * `onAction` receives the action and the context and does the actual work.
 * Handlers that only need Back / New / Refresh should delegate to
 * `runStandardRecordCommand` rather than reimplementing them — a registry
 * default reaching a bespoke page with no handler for it is how a Refresh
 * button comes to render and do nothing.
 */
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
  /*
   * The notice carries its own outcome. Its colour used to be guessed from the
   * text — red only if it contained "could not" or "Unable" — so the API's
   * "Action reject-partner is not available for partners." rendered green, as
   * did every refusal phrased any other way.
   */
  const [notice, setNotice] = useState<{
    text: string;
    failed: boolean;
  } | null>(null);
  const [confirmAction, setConfirmAction] =
    useState<RuntimeActionDefinition | null>(null);
  /*
   * Snapshotted when the confirmation opens, not derived on each render: the
   * context object is rebuilt by every parent render, and a dialog keyed on it
   * would re-run its dependency requests each time.
   */
  const [dependencyCheck, setDependencyCheck] = useState<{
    targets: Array<{ id: string; label: string }>;
    getDependencies: (id: string) => Promise<RecordDependencyReport | null>;
  } | null>(null);
  const cancelConfirm = useCallback(() => {
    setConfirmAction(null);
    setDependencyCheck(null);
  }, []);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement | null>(null);
  const slotRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const available = useMemo(
    () =>
      orderCommands(actions.filter((action) => isVisible(action, context))),
    [actions, context],
  );
  /*
   * The keys that do not fit. Empty until measured — the server render and the
   * first client render agree on "everything inline", so hydration never
   * disagrees, and the layout effect corrects it before the first paint.
   */
  const [overflowKeys, setOverflowKeys] = useState<string[]>([]);
  const availableSignature = available.map((action) => action.key).join("|");
  const availableRef = useRef(available);
  availableRef.current = available;
  useIsomorphicLayoutEffect(() => {
    const slot = slotRef.current;
    const measure = measureRef.current;
    if (!slot || !measure) return;
    const compute = () => {
      const commandWidths = Array.from(
        measure.querySelectorAll<HTMLElement>("[data-command-measure]"),
      ).map((node) => node.getBoundingClientRect().width);
      const moreWidth =
        measure
          .querySelector<HTMLElement>("[data-more-measure]")
          ?.getBoundingClientRect().width ?? 0;
      const { overflow } = fitCommands(
        availableRef.current,
        commandWidths,
        slot.clientWidth,
        moreWidth,
        COMMAND_GAP_PX,
      );
      const next = overflow.map((action) => String(action.key));
      setOverflowKeys((current) =>
        current.join("|") === next.join("|") ? current : next,
      );
    };
    compute();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(compute);
    observer.observe(slot);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [availableSignature]);
  const primary = available.filter(
    (action) => !overflowKeys.includes(String(action.key)),
  );
  const overflow = available.filter((action) =>
    overflowKeys.includes(String(action.key)),
  );
  // An emptied menu cannot stay open, e.g. after the window widens.
  const menuOpen = overflowOpen && overflow.length > 0;
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
  /*
   * What the confirmation actually says.
   *
   * The action's own `confirmTitle` / `confirmDescription` are static strings
   * and cannot name a record or count a selection, which is exactly what both
   * dialogs were missing (BUG-1560, BUG-1756). They stay as the fallback for an
   * action with nothing to name.
   */
  const confirmCopy = useMemo(
    () =>
      describeDestructiveConfirm({
        labels:
          context.scope === "record"
            ? [recordDisplayName(context.record) ?? ""].filter(Boolean)
            : (context.selectedLabels ?? []),
        count:
          context.scope === "record"
            ? context.record
              ? 1
              : 0
            : (context.selectedIds?.length ?? 0),
        singular: context.displayName ?? "record",
        plural: context.pluralDisplayName ?? "records",
        fallbackTitle: confirmAction?.confirmTitle,
        fallbackDescription: confirmAction?.confirmDescription,
      }),
    [confirmAction, context],
  );

  function execute(action: RuntimeActionDefinition) {
    // A reason-prompted action is confirmed by its reason dialog instead.
    if (action.destructive && !action.reasonPrompt && !confirmAction) {
      setConfirmAction(action);
      setDependencyCheck(dependencyCheckFor(action, context));
      return;
    }
    setConfirmAction(null);
    setDependencyCheck(null);
    setOverflowOpen(false);
    setPendingKey(action.key);
    setNotice(null);
    /*
     * Not a React transition. In React 19 every state update made inside an
     * async transition is held until the whole action resolves; an action that
     * awaits a prompt (useReasonPrompt sets its dialog state and waits for the
     * operator) therefore never showed the prompt and never finished, so
     * Suspend, Deactivate, Reject and every other reason-prompted command did
     * nothing at all. `pendingKey` already carries the busy state.
     */
    void (async () => {
      try {
        const result = await onAction(action, context);
        setNotice(describeActionNotice(result));
      } catch (error) {
        setNotice({
          text:
            error instanceof Error
              ? error.message
              : "Action could not be completed.",
          failed: true,
        });
      } finally {
        setPendingKey(null);
      }
    })();
  }
  return (
    <>
      <div
        /*
         * z-10: above the page it scrolls over, below the application shell.
         * At z-30 it tied with the topbar and won on DOM order, so an open
         * profile menu was sliced in half by the command bar behind it.
         */
        className={`sticky top-0 z-10 flex min-h-12 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 px-2 py-1.5 shadow-sm backdrop-blur ${className ?? ""}`}
      >
        <div
          ref={slotRef}
          role="toolbar"
          aria-label="Commands"
          className="relative flex min-w-0 flex-1 items-center gap-1"
        >
          {/*
           * Every command at its natural width, invisible, so the bar knows
           * what would fit without first drawing it wrong. Inert and hidden
           * from assistive technology — it is a ruler, not a second toolbar.
           */}
          <div
            ref={measureRef}
            aria-hidden
            inert
            className="pointer-events-none invisible absolute left-0 top-0 flex w-max items-center gap-1"
          >
            {available.map((action) => (
              <span key={action.key} data-command-measure>
                <ActionButton
                  action={action}
                  busy={false}
                  disabledReason={null}
                  onClick={() => undefined}
                />
              </span>
            ))}
            <span data-more-measure>
              <MoreButton expanded={false} onClick={() => undefined} />
            </span>
          </div>
          {primary.map((action) => (
            <ActionButton
              key={action.key}
              action={action}
              busy={pendingKey === action.key}
              disabledReason={disabledReason(action, context)}
              onClick={() => execute(action)}
            />
          ))}
          {overflow.length ? (
            <div className="relative shrink-0" ref={overflowRef}>
              <MoreButton
                expanded={menuOpen}
                onClick={() => setOverflowOpen((value) => !value)}
              />
              {menuOpen ? (
                <div
                  role="menu"
                  aria-label="More commands"
                  onKeyDown={(event) =>
                    handleMenuKey(event, () => setOverflowOpen(false))
                  }
                  className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
                >
                  {overflow.map((action, index) => (
                    <button
                      role="menuitem"
                      key={action.key}
                      type="button"
                      autoFocus={index === 0}
                      title={disabledReason(action, context) ?? undefined}
                      disabled={
                        Boolean(disabledReason(action, context)) ||
                        pendingKey === action.key
                      }
                      onClick={() => execute(action)}
                      className={`flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium outline-none focus-visible:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent ${action.destructive ? "text-rose-700 hover:bg-rose-50" : "text-slate-700 hover:bg-slate-100"}`}
                    >
                      {pendingKey === action.key ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        iconFor(action)
                      )}
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {notice || statusSlot ? (
          <div className="flex min-w-0 shrink items-center gap-3">
            {notice ? (
              <span
                role="status"
                title={notice.text}
                className={`truncate text-xs font-medium ${notice.failed ? "text-rose-600" : "text-emerald-700"}`}
              >
                {notice.text}
              </span>
            ) : null}
            {statusSlot}
          </div>
        ) : null}
      </div>
      {confirmAction && dependencyCheck ? (
        <DependencyAwareDeleteDialog
          title={confirmCopy.title}
          description={confirmCopy.description}
          names={confirmCopy.names}
          targets={dependencyCheck.targets}
          getDependencies={dependencyCheck.getDependencies}
          onCancel={cancelConfirm}
          onConfirm={() => execute(confirmAction)}
        />
      ) : confirmAction ? (
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
              {confirmCopy.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {confirmCopy.description}
            </p>
            {confirmCopy.names.length ? (
              <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                {confirmCopy.names.map((name) => (
                  <li key={name} className="truncate">
                    {name}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelConfirm}
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

/*
 * One visual language for every command: same height, type, icon size and
 * spacing, no box around an ordinary command. The bar is the container; a
 * border on each button inside it was noise, and the mix of bordered, filled
 * and outlined buttons made equal commands look unequal. Only a genuine
 * primary business action is filled, and a destructive one is told apart by
 * colour *and* its label, never colour alone.
 */
const COMMAND_BASE =
  "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)] focus-visible:ring-offset-1 disabled:cursor-not-allowed";
const COMMAND_TONE = {
  normal:
    "text-slate-700 hover:bg-slate-100 hover:text-slate-950 disabled:text-slate-400 disabled:hover:bg-transparent",
  destructive:
    "text-rose-700 hover:bg-rose-50 disabled:text-rose-300 disabled:hover:bg-transparent",
  primary:
    "bg-[var(--admin-primary)] text-white shadow-sm hover:bg-[var(--admin-primary-hover)] disabled:bg-transparent disabled:text-slate-400 disabled:shadow-none",
} as const;

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
  const tone =
    action.placement === "primary"
      ? "primary"
      : action.destructive
        ? "destructive"
        : "normal";
  return (
    <button
      type="button"
      disabled={Boolean(reason) || busy}
      aria-busy={busy || undefined}
      title={reason ?? undefined}
      onClick={onClick}
      className={`${COMMAND_BASE} ${COMMAND_TONE[tone]}`}
    >
      {busy ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : (
        iconFor(action)
      )}
      {action.label}
    </button>
  );
}

function MoreButton({
  expanded,
  onClick,
}: {
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-haspopup="menu"
      aria-expanded={expanded}
      onClick={onClick}
      className={`${COMMAND_BASE} ${COMMAND_TONE.normal} ${expanded ? "bg-slate-100" : ""}`}
    >
      <MoreHorizontal className="h-4 w-4" />
      More
      <ChevronDown className="h-3.5 w-3.5" />
    </button>
  );
}

/** Arrow keys move through the menu; Escape closes it. */
function handleMenuKey(
  event: React.KeyboardEvent<HTMLDivElement>,
  close: () => void,
) {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>(
      "[role=menuitem]:not(:disabled)",
    ),
  );
  if (!items.length) return;
  const current = items.indexOf(document.activeElement as HTMLButtonElement);
  const step = event.key === "ArrowDown" ? 1 : -1;
  items[(current + step + items.length) % items.length]?.focus();
}

/**
 * The records a delete confirmation should check, or null for an action that
 * is not a delete or a context with no dependency lookup.
 */
function dependencyCheckFor(
  action: RuntimeActionDefinition,
  context: ModuleActionContext,
) {
  const getDependencies = context.getDependencies;
  if (!getDependencies) return null;
  if (action.key !== "delete" && action.key !== "bulk-delete") return null;
  const recordId =
    context.recordId ??
    (context.record?.id ? String(context.record.id) : undefined);
  const targets =
    context.scope === "record"
      ? recordId
        ? [
            {
              id: recordId,
              label: recordDisplayName(context.record) ?? recordId,
            },
          ]
        : []
      : (context.selectedTargets ??
        (context.selectedIds ?? []).map((id) => ({ id, label: id })));
  return targets.length ? { targets, getDependencies } : null;
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
  if (!hasRuntimePermission(action.permission, context)) return false;
  if (!commandMatchesRecord(action, context.record)) return false;
  const count = context.selectedIds?.length ?? 0;
  if (action.selection === "one" && count !== 1) return false;
  if (action.selection === "many" && count < 2) return false;
  if (action.selection === "any" && count < 1) return false;
  if (action.selection === "none" && count > 0) return false;
  return true;
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
const ACTION_ICONS: Record<string, LucideIcon> = {
  back: ArrowLeft,
  new: Plus,
  edit: Edit3,
  save: Save,
  delete: Trash2,
  refresh: RefreshCw,
  export: Download,
  send: Send,
  approve: UserRoundCheck,
  reject: CircleX,
  document: FileSignature,
  qualify: UserRoundCheck,
  disqualify: CircleX,
  convert: UserRoundPlus,
  agreement: Handshake,
  check: Check,
};

function iconFor(action: RuntimeActionDefinition) {
  const semanticIcon = action.icon?.trim().toLowerCase();
  const key = String(action.key).toLowerCase();
  const inferredIcon = key.includes("delete")
    ? "delete"
    : key.includes("save")
      ? "save"
      : key.includes("send") || key.includes("resend")
        ? "send"
        : key.includes("agreement")
          ? "agreement"
          : key.includes("document")
            ? "document"
            : key;
  const Icon =
    (semanticIcon ? ACTION_ICONS[semanticIcon] : undefined) ??
    ACTION_ICONS[inferredIcon] ??
    ACTION_ICONS.check!;
  return <Icon className="h-4 w-4" />;
}
