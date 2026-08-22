"use client";

import * as React from "react";

/**
 * The one modal primitive for `apps/web`.
 *
 * `apps/web/AGENTS.md` has always required that dialogs be focus-trapped,
 * dismissible with Escape and announced as dialogs — and a hand-rolled dialog
 * is a review failure. That rule was unfulfillable, because the shared kit had
 * no dialog to reuse: `app/components/ui/` held `button`, `empty-state`,
 * `form-control`, `section-card` and `status-pill`, and nothing else. So every
 * modal in the app was a bespoke `<div className="fixed inset-0">`, none of them
 * trapped focus, three could not be closed with Escape, and Tab walked straight
 * out of all of them into the page behind. BUG-0043.
 *
 * ## Why this is built rather than installed
 *
 * `apps/web` declares exactly four dependencies — `@repo/config`, `next`,
 * `react`, `react-dom` — and AGENTS.md says not to add one without
 * justification. A headless dialog library (Radix, react-aria) would be a
 * defensible choice, but it is a bigger decision than this defect needs: what
 * is missing is focus containment, Escape, dialog semantics and focus restore,
 * which is roughly a hundred lines against the DOM. If the app later needs the
 * rest of a primitives library, that is an ADR, not a side effect of fixing an
 * accessibility bug.
 *
 * ## What it guarantees
 *
 * - **Focus is contained.** Tab and Shift+Tab cycle within the dialog. Focus
 *   moves into the dialog on open and returns to the element that opened it on
 *   close, so a keyboard user is not dropped at the top of the document.
 * - **Escape closes**, unless the dialog is busy — a half-finished write should
 *   not be dismissed by a stray keystroke.
 * - **It is announced.** `role="dialog"`, `aria-modal="true"` and an
 *   `aria-labelledby` pointing at the rendered title. A dialog with no
 *   accessible name is read out as an unnamed group.
 * - **The page behind does not scroll** while it is open.
 * - **A click on the backdrop closes it**, and a click inside does not — the
 *   handler is on the backdrop itself, not a document listener, so a drag that
 *   ends outside the dialog does not dismiss it mid-edit.
 */

/** Everything focusable, minus the things that are focusable but shouldn't be. */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled])",
  "iframe",
  "object",
  "embed",
  "[contenteditable]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    // `offsetParent === null` catches `display: none` ancestors, which
    // `:not([disabled])` does not. A hidden control still matches the selector
    // and would silently swallow a Tab stop.
  ).filter((element) => element.offsetParent !== null || element === document.activeElement);
}

export type DialogProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Rendered as the dialog's heading and used as its accessible name. */
  readonly title: React.ReactNode;
  readonly description?: React.ReactNode;
  readonly children?: React.ReactNode;
  /** Buttons, rendered right-aligned below the body. */
  readonly footer?: React.ReactNode;
  /**
   * While true, Escape and the backdrop do not close the dialog. Use it for the
   * span of an in-flight write, not as a general "modal" flag.
   */
  readonly busy?: boolean;
  readonly size?: "sm" | "md" | "lg" | "xl";
  /**
   * `center` is a centred modal card; `panel` is a full-height sheet against
   * the right edge. Both are modal and both get the same containment — the only
   * difference is where the box sits, which is a layout decision some flows
   * (a long action form beside the record it acts on) genuinely need.
   */
  readonly variant?: "center" | "panel";
  /** Set false for a dialog the user must answer, such as session expiry. */
  readonly dismissible?: boolean;
  readonly className?: string;
  /** Test hook / analytics id, forwarded to the dialog element. */
  readonly "data-testid"?: string;
};

const SIZE_CLASS: Record<NonNullable<DialogProps["size"]>, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

/**
 * The behaviour half of {@link Dialog}, on its own.
 *
 * `Dialog` also owns a layout - a centred card or a right-hand sheet with a
 * title, body and footer. Most of the app's modals predate it and carry their
 * own layout, sometimes an elaborate one (an image cropper, a device mapping
 * workspace, a monthly timesheet editor). Restructuring those to fit a shared
 * shell would be a redesign, and a redesign is not what BUG-0043 found wrong
 * with them: what is wrong is that Tab leaves them, Escape does nothing and a
 * screen reader is never told they are dialogs.
 *
 * So the guarantees are available without the shell. Spread `panelProps` onto
 * the element that *is* the dialog - the panel, not the backdrop - spread
 * `backdropProps` onto the backdrop, and put `titleId` on the heading:
 *
 * ```tsx
 * const { panelProps, backdropProps, titleId } = useDialogBehavior({ open, onClose });
 * return (
 *   <div className="fixed inset-0 ..." {...backdropProps}>
 *     <div className="..." {...panelProps}>
 *       <h2 id={titleId}>Assign records</h2>
 *     </div>
 *   </div>
 * );
 * ```
 */
export function useDialogBehavior({
  open,
  onClose,
  busy = false,
  dismissible = true,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly busy?: boolean;
  readonly dismissible?: boolean;
}) {
  // `HTMLElement`, not `HTMLDivElement`: several of the app's modals are a
  // `<form>` rather than a `<div>`, and the panel is whichever element carries
  // the dialog role.
  const panelRef = React.useRef<HTMLElement | null>(null);
  const restoreFocusRef = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();
  const descriptionId = React.useId();

  const canDismiss = dismissible && !busy;

  // Remember who opened us, before anything inside takes focus.
  React.useEffect(() => {
    if (!open) return;
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    return () => {
      // The opener may have been unmounted by whatever the dialog did; only
      // restore focus to something still in the document.
      const opener = restoreFocusRef.current;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open]);

  // Move focus in. Prefer the first control, fall back to the panel - a dialog
  // with nothing focusable still needs focus off the page behind it.
  React.useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const first = focusableWithin(panel)[0];
    (first ?? panel).focus();
  }, [open]);

  // Escape, and the focus trap itself.
  React.useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (canDismiss) {
          event.stopPropagation();
          onClose();
        }
        return;
      }

      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = focusableWithin(panel);
      if (focusable.length === 0) {
        // Nothing to move to - keep focus on the panel rather than letting Tab
        // escape to the page behind.
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
        return;
      }

      if (active instanceof Node && !panel.contains(active)) {
        // Focus escaped some other way - a programmatic blur, an iframe.
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [open, canDismiss, onClose]);

  // Hold the page still underneath.
  React.useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return {
    titleId,
    descriptionId,
    canDismiss,
    panelRef,
    /** Spread onto the dialog panel - the box, not the backdrop. */
    panelProps: {
      "aria-labelledby": titleId,
      "aria-modal": true as const,
      // Cast because the same props object is spread onto a <div> in one place
      // and a <form> in another; the ref is only ever read as an HTMLElement.
      ref: panelRef as React.Ref<never>,
      role: "dialog" as const,
      tabIndex: -1,
    },
    /**
     * Spread onto the backdrop. Closes on a click that both starts and ends
     * there, so a text drag out of the dialog does not dismiss it mid-edit, and
     * marks the backdrop as presentation - it duplicates Escape rather than
     * being a control of its own.
     */
    backdropProps: {
      onMouseDown: (event: React.MouseEvent) => {
        if (event.target === event.currentTarget && canDismiss) onClose();
      },
      role: "presentation" as const,
    },
  };
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  busy = false,
  size = "sm",
  variant = "center",
  dismissible = true,
  className,
  ...rest
}: DialogProps) {
  const { titleId, descriptionId, panelProps, backdropProps } = useDialogBehavior({
    open,
    onClose,
    busy,
    dismissible,
  });

  if (!open) return null;

  const isPanel = variant === "panel";

  return (
    <div
      className={
        isPanel
          ? "fixed inset-0 z-[110] flex justify-end bg-black/30"
          : "fixed inset-0 z-[110] flex items-center justify-center bg-black/40 px-4 py-8"
      }
      {...backdropProps}
    >
      <div
        aria-describedby={description ? descriptionId : undefined}
        className={[
          "flex flex-col overflow-hidden border-border bg-white shadow-2xl outline-none",
          isPanel
            ? "h-full w-full border-l"
            : "max-h-full w-full rounded-[28px] border",
          SIZE_CLASS[size],
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        {...panelProps}
        {...rest}
      >
        <div
          className={
            isPanel
              ? "space-y-1 border-b border-border px-5 py-4"
              : "space-y-2 px-6 pt-6"
          }
        >
          <h2 className="text-lg font-semibold text-foreground" id={titleId}>
            {title}
          </h2>
          {description ? (
            <p
              className={isPanel ? "text-xs text-muted" : "text-sm leading-6 text-muted"}
              id={descriptionId}
            >
              {description}
            </p>
          ) : null}
        </div>

        {children ? (
          <div
            className={
              isPanel
                ? "min-h-0 flex-1 overflow-y-auto px-5 py-4"
                : "min-h-0 flex-1 overflow-y-auto px-6 py-4"
            }
          >
            {children}
          </div>
        ) : (
          <div className="h-2" />
        )}

        {footer ? (
          <div
            className={[
              "flex flex-col-reverse gap-3 border-t border-border sm:flex-row sm:justify-end",
              isPanel ? "px-5 py-4" : "px-6 py-4",
            ].join(" ")}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The close affordance most dialogs want in their footer or header.
 *
 * Exported separately so a dialog can place it where its layout needs it, and
 * so the accessible name is never left to an icon.
 */
export function DialogCloseButton({
  label = "Close",
  onClick,
  disabled,
}: {
  readonly label?: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <button
      className="rounded-2xl border border-border bg-white px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
