"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEventHandler,
  type RefObject,
  type ReactNode,
} from "react";
import {
  getEffectiveFormGridColumnCount,
  normalizeFormGridColumn,
  normalizeFormGridColumnCount,
  normalizeFormGridColumnSpan,
  type FormGridColumnCount,
  type FormGridColumnSpan,
} from "@/lib/runtime/form-layout-grid";

export type FormGridKind = "tab" | "section" | "preview";

type FormGridProps = {
  readonly children: ReactNode;
  readonly className?: string;
  readonly columns?: unknown;
  readonly gap?: "section" | "field";
  readonly kind: FormGridKind;
  readonly onDragOver?: DragEventHandler<HTMLDivElement>;
};

type FormGridItemProps = {
  readonly children: ReactNode;
  readonly className?: string;
  readonly column?: unknown;
  readonly columnSpan?: unknown;
  readonly dataRuntimeField?: string;
  readonly dataRuntimeWidget?: string;
  readonly parentColumns?: unknown;
};

export function FormGrid({
  children,
  className = "",
  columns,
  gap = "field",
  kind,
  onDragOver,
}: FormGridProps) {
  const normalizedColumns = normalizeFormGridColumnCount(columns);
  const gridRef = useRef<HTMLDivElement>(null);
  const effectiveColumns = useResponsiveGridColumns({
    columns: normalizedColumns,
    enabled: kind === "section",
    ref: gridRef,
  });

  return (
    <div
      ref={gridRef}
      className={[
        "dp-form-grid",
        kind === "section" ? "dp-form-grid-section" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-form-grid={kind}
      data-columns={normalizedColumns}
      data-effective-columns={effectiveColumns}
      data-gap={gap}
      onDragOver={onDragOver}
      /*
       * `onDragOver` makes this a drop target for the form designer, not a
       * control: there is nothing here to activate, and every field inside is
       * separately reachable. `group` gives it a non-interactive role so the
       * grid is not announced as something the user can operate. Keyboard
       * reordering of designer elements is ITEM-0080, not this element's job.
       */
      role="group"
      style={formGridStyle(effectiveColumns)}
    >
      {children}
    </div>
  );
}

export function FormGridItem({
  children,
  className = "",
  column,
  columnSpan,
  dataRuntimeField,
  dataRuntimeWidget,
  parentColumns,
}: FormGridItemProps) {
  const normalizedParentColumns = normalizeFormGridColumnCount(parentColumns);
  const normalizedSpan = normalizeFormGridColumnSpan(
    columnSpan,
    normalizedParentColumns,
  );
  const normalizedColumn = normalizeFormGridColumn(column, normalizedParentColumns);

  return (
    <div
      className={["dp-form-grid-item", className].filter(Boolean).join(" ")}
      data-column={normalizedColumn ?? undefined}
      data-runtime-field={dataRuntimeField}
      data-runtime-widget={dataRuntimeWidget}
      data-span={normalizedSpan}
      style={formGridItemStyle({
        column: normalizedColumn,
        columnSpan: normalizedSpan,
      })}
    >
      {children}
    </div>
  );
}

function useResponsiveGridColumns({
  columns,
  enabled,
  ref,
}: {
  readonly columns: FormGridColumnCount;
  readonly enabled: boolean;
  readonly ref: RefObject<HTMLDivElement | null>;
}) {
  const [effectiveColumns, setEffectiveColumns] = useState(columns);

  useEffect(() => {
    if (!enabled || typeof ResizeObserver === "undefined") return;

    let frame = 0;
    const updateWidth = (width: number) => {
      const nextColumns = getEffectiveFormGridColumnCount(columns, width);
      setEffectiveColumns((current) =>
        nextColumns === current ? current : nextColumns,
      );
    };
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        updateWidth(width);
      });
    });
    const target = ref.current;

    if (target) {
      observer.observe(target);
      frame = requestAnimationFrame(() => {
        updateWidth(target.getBoundingClientRect().width);
      });
    }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [columns, enabled, ref]);

  return enabled ? effectiveColumns : columns;
}

export function formGridStyle(columns: FormGridColumnCount): CSSProperties {
  return {
    "--dp-form-grid-columns": columns,
  } as CSSProperties;
}

export function formGridItemStyle({
  column,
  columnSpan,
}: {
  readonly column: FormGridColumnSpan | null;
  readonly columnSpan: FormGridColumnSpan;
}): CSSProperties {
  return {
    "--dp-form-grid-column": column ?? undefined,
    "--dp-form-grid-column-span": columnSpan,
  } as CSSProperties;
}

export {
  columnsFromSectionLayout,
  normalizeFormGridColumnCount,
  normalizeFormGridColumnSpan,
} from "@/lib/runtime/form-layout-grid";
