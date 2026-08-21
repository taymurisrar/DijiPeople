"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

export type RowAction = {
  key: string;
  label: string;
  onSelect: () => void;
  /** Disabled with a reason. A disabled control with no explanation is a bug report. */
  disabledReason?: string;
  destructive?: boolean;
  /** Exactly one action may be primary; it is the only one drawn inline. */
  primary?: boolean;
  hidden?: boolean;
};

/**
 * The actions available on one row of a table.
 *
 * Every action column in this app used to render its actions as a
 * `flex-wrap` row of full-text buttons — Disable, Send password reset, Make
 * primary, Resend invite, Delete. Five labelled buttons need roughly 700px, the
 * column was given 260, so they wrapped onto three lines, tripled the row
 * height, and pushed the table into horizontal scroll. The result was a table
 * where the actions were the widest thing on screen and the data was the part
 * you had to scroll to find.
 *
 * One action inline, the rest behind a menu. That is what the command bar
 * already does at record scope, and a row is the same problem at smaller scale:
 * the common action should cost one click, and the rare and dangerous ones
 * should cost two and be somewhere predictable.
 *
 * Destructive actions are always in the menu, never inline, whatever they
 * declare — Delete sitting next to the pointer at the end of a row is how a row
 * gets deleted by somebody aiming at the row above.
 */
export function RowActions({
  actions,
  label = "Row actions",
  busy = false,
}: {
  actions: RowAction[];
  label?: string;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const visible = actions.filter((action) => !action.hidden);
  if (!visible.length) return null;

  const inline = visible.find(
    (action) => action.primary && !action.destructive && !action.disabledReason,
  );
  const menu = visible.filter((action) => action !== inline);

  return (
    <div ref={rootRef} className="relative flex items-center justify-end gap-1.5">
      {inline ? (
        <button
          type="button"
          onClick={inline.onSelect}
          disabled={busy}
          className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {inline.label}
        </button>
      ) : null}

      {menu.length ? (
        <>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={label}
            disabled={busy}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </button>
          {open ? (
            <div
              role="menu"
              /*
               * z-20 is `pagePopover` in the stacking contract asserted by
               * `lib/z-layers.spec.ts`: above the table's sticky header and
               * pagination bar at z-10, and below the application shell at
               * z-30. A row menu that claimed the shell's layer would paint
               * over the topbar's own profile menu, which is the defect that
               * spec was written for.
               */
              className="absolute right-0 top-[calc(100%+4px)] z-20 min-w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
            >
              {menu.map((action) => (
                <button
                  key={action.key}
                  role="menuitem"
                  type="button"
                  title={action.disabledReason}
                  disabled={Boolean(action.disabledReason)}
                  onClick={() => {
                    setOpen(false);
                    action.onSelect();
                  }}
                  className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    action.destructive
                      ? "text-rose-700 hover:bg-rose-50"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
