"use client";

import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpDown,
  ChevronDown,
  Funnel,
  SlidersHorizontal,
} from "lucide-react";
import clsx from "clsx";

type HeaderMenuAlign = "left" | "right";
type HeaderMenuSize = "sm" | "md" | "lg" | "xl";

type DataTableHeaderMenuProps = {
  label: string;
  children: ReactNode;
  hasFilter?: boolean;
  hasSort?: boolean;
  isActive?: boolean;
  disabled?: boolean;
  title?: string;
  description?: string;
  badge?: string | number;
  showActiveDot?: boolean;
  width?: number | string;
  size?: HeaderMenuSize;
  align?: HeaderMenuAlign;
  triggerClassName?: string;
  panelClassName?: string;
  contentClassName?: string;
  labelClassName?: string;
  icon?: ReactNode;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  closeOnContentClick?: boolean;
  footer?: ReactNode;
};

type PanelPosition = {
  top: number;
  left: number;
  width: number | string;
};

function getPanelWidth(size: HeaderMenuSize, width?: number | string) {
  if (width !== undefined) return width;

  switch (size) {
    case "sm":
      return 220;
    case "md":
      return 280;
    case "lg":
      return 340;
    case "xl":
      return 420;
    default:
      return 280;
  }
}

function getNumericWidth(width: number | string) {
  if (typeof width === "number") return width;

  const parsed = Number.parseInt(width, 10);
  return Number.isFinite(parsed) ? parsed : 320;
}

export function DataTableHeaderMenu({
  label,
  children,
  hasFilter = true,
  hasSort = false,
  isActive = false,
  disabled = false,
  title,
  description,
  badge,
  showActiveDot = false,
  width,
  size = "md",
  align = "left",
  triggerClassName,
  panelClassName,
  contentClassName,
  labelClassName,
  icon,
  isOpen,
  defaultOpen = false,
  onOpenChange,
  closeOnContentClick = false,
  footer,
}: DataTableHeaderMenuProps) {
  const generatedId = useId();
  const buttonId = `${generatedId}-button`;
  const panelId = `${generatedId}-panel`;

  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const isControlled = typeof isOpen === "boolean";
  const open = isControlled ? isOpen : internalOpen;
  const resolvedWidth = getPanelWidth(size, width);

  const calculatePanelPosition = useCallback((): PanelPosition | null => {
    const button = buttonRef.current;

    if (!button) return null;

    const rect = button.getBoundingClientRect();
    const numericWidth = getNumericWidth(resolvedWidth);
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const safePadding = 16;
    const gap = 8;

    let left = align === "right" ? rect.right - numericWidth : rect.left;

    left = Math.max(
      safePadding,
      Math.min(left, viewportWidth - numericWidth - safePadding),
    );

    const panelHeight = panelRef.current?.offsetHeight ?? 380;

    let top = rect.bottom + gap;

    if (top + panelHeight > viewportHeight - safePadding) {
      top = Math.max(safePadding, rect.top - panelHeight - gap);
    }

    return {
      top,
      left,
      width: resolvedWidth,
    };
  }, [align, resolvedWidth]);

  const setOpen = useCallback(
    (next: boolean) => {
      if (next) {
        const nextPosition = calculatePanelPosition();
        setPanelPosition(nextPosition);
      } else {
        setPanelPosition(null);
      }

      if (!isControlled) {
        setInternalOpen(next);
      }

      onOpenChange?.(next);
    },
    [calculatePanelPosition, isControlled, onOpenChange],
  );

  const resolvedIcon = useMemo(() => {
    if (icon) return icon;

    if (hasSort && !hasFilter) return <ArrowUpDown className="h-4 w-4" />;
    if (hasFilter && !hasSort) return <Funnel className="h-4 w-4" />;
    if (hasFilter && hasSort) return <SlidersHorizontal className="h-4 w-4" />;

    return <ChevronDown className="h-4 w-4" />;
  }, [hasFilter, hasSort, icon]);

  function handleTriggerClick() {
    if (disabled) return;
    setOpen(!open);
  }

  function handleOutsidePointer(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as Node;

    if (containerRef.current?.contains(target)) return;
    if (panelRef.current?.contains(target)) return;

    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      buttonRef.current?.focus();
    }
  }

  function handleContentClick() {
    if (closeOnContentClick) {
      setOpen(false);
    }
  }

  const panel =
    open && panelPosition
      ? createPortal(
          <div
            className="fixed inset-0 z-[9998]"
            onMouseDown={handleOutsidePointer}
            onKeyDown={handleKeyDown}
            role="presentation"
          >
            <div
              ref={panelRef}
              id={panelId}
              aria-labelledby={buttonId}
              className={clsx(
                "fixed z-[9999] max-h-[min(520px,calc(100vh-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15",
                panelClassName,
              )}
              style={{
                top: panelPosition.top,
                left: panelPosition.left,
                width: panelPosition.width,
              }}
              role="dialog"
              onMouseDown={(event) => event.stopPropagation()}
            >
              {title || description ? (
                <div className="border-b border-slate-100 px-4 py-3">
                  {title ? (
                    <div className="text-sm font-semibold text-slate-900">
                      {title}
                    </div>
                  ) : null}

                  {description ? (
                    <div className="mt-1 text-xs leading-5 text-slate-500">
                      {description}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div
                className={clsx(
                  "max-h-[360px] overflow-y-auto p-3",
                  contentClassName,
                )}
                onClick={handleContentClick}
              >
                {children}
              </div>

              {footer ? (
                <div className="border-t border-slate-100 px-4 py-3">
                  {footer}
                </div>
              ) : null}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div
        className="relative inline-flex max-w-full items-center gap-2"
        ref={containerRef}
      >
        <span
          className={clsx(
            "truncate font-medium text-slate-600",
            labelClassName,
          )}
          title={label}
        >
          {label}
        </span>

        {showActiveDot && isActive ? (
          <span
            className="inline-flex h-2 w-2 rounded-full bg-slate-900"
            aria-hidden="true"
          />
        ) : null}

        {badge !== undefined && badge !== null && badge !== "" ? (
          <span
            className={clsx(
              "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
              isActive
                ? "bg-slate-900 text-white"
                : "bg-slate-200 text-slate-700",
            )}
          >
            {badge}
          </span>
        ) : null}

        <button
          ref={buttonRef}
          id={buttonId}
          aria-controls={panelId}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={`${label} options`}
          className={clsx(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition",
            disabled
              ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
              : isActive
                ? "border-slate-300 bg-slate-100 text-slate-900"
                : "border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-100 hover:text-slate-700",
            triggerClassName,
          )}
          disabled={disabled}
          onClick={handleTriggerClick}
          type="button"
        >
          {resolvedIcon}
        </button>
      </div>

      {panel}
    </>
  );
}

type DataTableHeaderMenuSectionProps = {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function DataTableHeaderMenuSection({
  title,
  description,
  children,
  className,
}: DataTableHeaderMenuSectionProps) {
  return (
    <div className={clsx("space-y-2", className)}>
      {title ? (
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </div>
      ) : null}

      {description ? (
        <div className="text-xs text-slate-500">{description}</div>
      ) : null}

      {children}
    </div>
  );
}

type DataTableHeaderMenuActionsProps = {
  onClear?: () => void;
  onApply?: () => void;
  clearLabel?: string;
  applyLabel?: string;
  applyDisabled?: boolean;
  hideClear?: boolean;
  hideApply?: boolean;
  className?: string;
};

export function DataTableHeaderMenuActions({
  onClear,
  onApply,
  clearLabel = "Clear",
  applyLabel = "Apply",
  applyDisabled = false,
  hideClear = false,
  hideApply = false,
  className,
}: DataTableHeaderMenuActionsProps) {
  return (
    <div className={clsx("flex items-center justify-between gap-3", className)}>
      <div>
        {!hideClear ? (
          <button
            className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
            onClick={onClear}
            type="button"
          >
            {clearLabel}
          </button>
        ) : (
          <span />
        )}
      </div>

      {!hideApply ? (
        <button
          className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={applyDisabled}
          onClick={onApply}
          type="button"
        >
          {applyLabel}
        </button>
      ) : null}
    </div>
  );
}