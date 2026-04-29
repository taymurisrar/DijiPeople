"use client";

import Link from "next/link";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CommandBarAction,
  CommandBarActionContext,
  CommandBarItem,
  CommandBarProps,
  isCommandGroup,
} from "./types";

const OVERFLOW_BUTTON_WIDTH = 52;
const COMMAND_GAP = 4;

export function CommandBar({
  variant = "form",
  selectedCount = 0,
  isDirty = false,
  isReadOnly = false,
  items,
  className,
}: CommandBarProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(items.length);

  const context: CommandBarActionContext = {
    selectedCount,
    isDirty,
    isReadOnly,
  };

  const visibleItems = useMemo(
    () =>
      items
        .filter((item) => !item.hidden)
        .map((item) => {
          if (!isCommandGroup(item)) return item;

          return {
            ...item,
            actions: item.actions.filter((action) => !action.hidden),
          };
        })
        .filter((item) => {
          if (!isCommandGroup(item)) return true;
          return item.actions.length > 0;
        }),
    [items],
  );

  useEffect(() => {
    function calculateVisibleItems() {
      const container = containerRef.current;
      const measure = measureRef.current;

      if (!container || !measure) return;

      const availableWidth = container.clientWidth;
      const measuredItems = Array.from(
        measure.querySelectorAll<HTMLElement>("[data-command-measure-item]"),
      );

      if (!measuredItems.length) {
        setVisibleCount(0);
        return;
      }

      let usedWidth = 0;
      let nextVisibleCount = measuredItems.length;

      for (let index = 0; index < measuredItems.length; index += 1) {
        const itemWidth = measuredItems[index]?.offsetWidth ?? 0;
        const gapWidth = index > 0 ? COMMAND_GAP : 0;
        const hasRemainingItems = index < measuredItems.length - 1;
        const reservedOverflowWidth = hasRemainingItems
          ? OVERFLOW_BUTTON_WIDTH + COMMAND_GAP
          : 0;

        if (
          usedWidth + gapWidth + itemWidth + reservedOverflowWidth >
          availableWidth
        ) {
          nextVisibleCount = index;
          break;
        }

        usedWidth += gapWidth + itemWidth;
      }

      setVisibleCount(nextVisibleCount);
    }

    calculateVisibleItems();

    const observer = new ResizeObserver(calculateVisibleItems);

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [visibleItems]);

  const primaryItems = visibleItems.slice(0, visibleCount);
  const overflowItems = visibleItems.slice(visibleCount);

  return (
    <div className={className ?? "sticky top-0 z-20 rounded-lg bg-white"}>
      <div ref={containerRef} className="relative px-4 py-2">
        <div className="flex min-w-0 items-center gap-1 overflow-hidden">
          {primaryItems.map((item) => (
            <Fragment key={item.key}>
              {isCommandGroup(item) ? (
                <CommandGroup group={item} context={context} />
              ) : (
                <CommandButton action={item} context={context} />
              )}
            </Fragment>
          ))}

          {overflowItems.length > 0 ? (
            <OverflowCommandGroup items={overflowItems} context={context} />
          ) : null}
        </div>

        <div
          ref={measureRef}
          aria-hidden="true"
          className="pointer-events-none invisible absolute left-0 top-0 flex h-0 items-center gap-1 overflow-hidden"
        >
          {visibleItems.map((item) => (
            <div key={item.key} data-command-measure-item>
              {isCommandGroup(item) ? (
                <MeasureGroupButton group={item} />
              ) : (
                <MeasureButton action={item} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function isActionDisabled(
  action: CommandBarAction,
  context: CommandBarActionContext,
) {
  const selectedCount = context.selectedCount ?? 0;
  const isEditAction = action.key === "edit";
  const isDeleteAction = action.key === "delete";

  if (action.disabled) return true;

  if (context.isReadOnly && action.key !== "back") return true;

  if (isEditAction && selectedCount !== 1) return true;

  if (isDeleteAction && selectedCount < 1) return true;

  if (action.requiresSelection && selectedCount < 1) return true;

  if (action.bulkOnly && selectedCount < 2) return true;

  return false;
}

function CommandButton({
  action,
  context,
}: {
  action: CommandBarAction;
  context: CommandBarActionContext;
}) {
  const Icon = action.icon;
  const isBackButton = action.key === "back";
  const disabled = isActionDisabled(action, context);

  async function handleClick() {
    if (disabled) return;

    if (action.confirm) {
      const confirmed = window.confirm(
        `${action.confirm.title}\n\n${action.confirm.message}`,
      );

      if (!confirmed) return;
    }

    await action.onClick?.(context);
  }

  const className = getButtonClassName({
    danger: action.danger,
    disabled,
    primary: action.key === "new",
    iconOnly: isBackButton,
  });

  const content = (
    <>
      {Icon ? <Icon className="h-4 w-4" /> : null}
      {!isBackButton ? <span>{action.label}</span> : null}
    </>
  );

  if (action.href && !disabled) {
    return (
      <Link
        href={action.href}
        title={action.tooltip ?? action.label}
        aria-label={action.tooltip ?? action.label}
        className={className}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      title={action.tooltip ?? action.label}
      aria-label={action.tooltip ?? action.label}
      disabled={disabled}
      onClick={handleClick}
      className={className}
    >
      {content}
    </button>
  );
}

function CommandGroup({
  group,
  context,
}: {
  group: Extract<CommandBarItem, { actions: CommandBarAction[] }>;
  context: CommandBarActionContext;
}) {
  const [open, setOpen] = useState(false);
  const Icon = group.icon ?? MoreHorizontal;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-normal text-black transition hover:bg-gray-100"
      >
        <Icon className="h-4 w-4" />
        <span>{group.label}</span>
        <ChevronDown className="h-4 w-4 text-muted" />
      </button>

      {open ? (
        <DropdownPanel align="left" title={group.label}>
          {group.actions.map((action) => (
            <DropdownAction
              key={action.key}
              action={action}
              context={context}
              close={() => setOpen(false)}
            />
          ))}
        </DropdownPanel>
      ) : null}
    </div>
  );
}

function OverflowCommandGroup({
  items,
  context,
}: {
  items: CommandBarItem[];
  context: CommandBarActionContext;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label="More commands"
        title="More commands"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-8 w-7 items-center justify-center rounded-md text-black transition hover:bg-gray-100"
      >
        <ChevronDown className="h-4 w-4" />
      </button>

      {open ? (
        <DropdownPanel align="right" title="More commands">
          {items.map((item) =>
            isCommandGroup(item) ? (
              <div key={item.key} className="py-1">
                <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  {item.label}
                </div>

                {item.actions.map((action) => (
                  <DropdownAction
                    key={action.key}
                    action={action}
                    context={context}
                    close={() => setOpen(false)}
                  />
                ))}
              </div>
            ) : (
              <DropdownAction
                key={item.key}
                action={item}
                context={context}
                close={() => setOpen(false)}
              />
            ),
          )}
        </DropdownPanel>
      ) : null}
    </div>
  );
}

function DropdownPanel({
  title,
  align,
  children,
}: {
  title: string;
  align: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`absolute z-30 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-white shadow-xl ${
        align === "right" ? "right-0" : "left-0"
      }`}
    >
      <div className="border-b border-border bg-surface-strong px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </div>

      <div className="p-1.5">{children}</div>
    </div>
  );
}

function DropdownAction({
  action,
  context,
  close,
}: {
  action: CommandBarAction;
  context: CommandBarActionContext;
  close: () => void;
}) {
  const Icon = action.icon;
  const isBackButton = action.key === "back";
  const disabled = isActionDisabled(action, context);

  async function handleClick() {
    if (disabled) return;

    if (action.confirm) {
      const confirmed = window.confirm(
        `${action.confirm.title}\n\n${action.confirm.message}`,
      );

      if (!confirmed) return;
    }

    await action.onClick?.(context);
    close();
  }

  const label = isBackButton ? action.tooltip ?? "Back" : action.label;

  if (action.href && !disabled) {
    return (
      <Link
        href={action.href}
        className={getDropdownClassName(action.danger, disabled)}
        onClick={close}
      >
        {Icon ? <Icon className="h-4 w-4" /> : null}
        <span>{label}</span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className={getDropdownClassName(action.danger, disabled)}
    >
      {Icon ? <Icon className="h-4 w-4" /> : null}
      <span>{label}</span>
    </button>
  );
}

function MeasureButton({ action }: { action: CommandBarAction }) {
  const Icon = action.icon;
  const isBackButton = action.key === "back";

  return (
    <div
      className={getButtonClassName({
        danger: action.danger,
        disabled: false,
        primary: action.key === "new",
        iconOnly: isBackButton,
      })}
    >
      {Icon ? <Icon className="h-4 w-4" /> : null}
      {!isBackButton ? <span>{action.label}</span> : null}
    </div>
  );
}

function MeasureGroupButton({
  group,
}: {
  group: Extract<CommandBarItem, { actions: CommandBarAction[] }>;
}) {
  const Icon = group.icon ?? MoreHorizontal;

  return (
    <div className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-normal text-black">
      <Icon className="h-4 w-4" />
      <span>{group.label}</span>
      <ChevronDown className="h-4 w-4 text-muted" />
    </div>
  );
}

function getButtonClassName({
  danger,
  disabled,
  primary,
  iconOnly,
}: {
  danger?: boolean;
  disabled?: boolean;
  primary?: boolean;
  iconOnly?: boolean;
}) {
  const size = iconOnly ? "w-7 justify-center px-0" : "px-2";

  const base = `inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md text-xs font-normal transition ${size}`;

  if (disabled) {
    return `${base} cursor-not-allowed text-gray-400 opacity-50`;
  }

  if (danger) {
    return `${base} text-red-600 hover:bg-red-50`;
  }

  if (primary) {
    return `${base} text-black hover:bg-gray-100`;
  }

  return `${base} text-black hover:bg-gray-100`;
}

function getDropdownClassName(danger?: boolean, disabled?: boolean) {
  const base = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition";

  if (disabled) {
    return `${base} cursor-not-allowed text-muted opacity-50`;
  }

  if (danger) {
    return `${base} text-red-600 hover:bg-red-50`;
  }

  return `${base} text-black hover:bg-gray-100`;
}