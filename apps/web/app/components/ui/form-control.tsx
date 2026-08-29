import * as React from "react";
import {
  activeDescendantId,
  listboxOptionId,
  nextActiveIndex,
} from "@/lib/a11y/listbox-navigation";
import { createPortal } from "react-dom";
import { Button } from "./button";

type SelectOption = {
  id?: string;
  value?: string;
  name?: string;
  label?: string;
  key?: string | null;
  code?: string | null;
};

export type LookupOption = {
  id: string;
  name: string;
  key?: string | null;
  code?: string | null;
  employeeLevelId?: string | null;
  subtitle?: string | null;
};

type TextFieldVariant = "default" | "cnic";

type BaseFieldProps = {
  label: string;
  hint?: string;
  warning?: string;
  error?: string;
  required?: boolean;
  touched?: boolean;
  dirty?: boolean;
  validationStatus?: "default" | "error" | "warning" | "success";
  className?: string;
};

function FieldShell({
  dirty,
  error,
  label,
  hint,
  required,
  touched,
  validationStatus,
  warning,
  className,
  children,
}: BaseFieldProps & { children: React.ReactNode }) {
  const generatedId = React.useId();
  const controlId = `field-${generatedId.replace(/:/g, "")}`;
  const feedbackId = `${controlId}-feedback`;
  const feedback = error || warning || hint;
  const feedbackTone = error
    ? "text-danger"
    : warning
      ? "text-amber-700"
      : "text-muted";

  return (
    <label
      htmlFor={controlId}
      className={["block space-y-2 text-sm", className]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="flex items-center gap-1.5 font-medium text-foreground">
        <span>
          {label}
          {required ? <span className="ml-1 text-danger">*</span> : null}
        </span>

        {hint ? (
          <span className="group relative inline-flex">
            <Button
              variant="ghost"
              size="icon-xs"
              type="button"
              tabIndex={0}
              aria-label={`${label} help`}
              onClick={(event) => event.preventDefault()}
              className="h-4 w-4 rounded-full border border-border bg-slate-50 text-[10px] font-semibold text-muted hover:border-accent hover:bg-accent/5 hover:text-accent"
            >
              i
            </Button>

            <span className="pointer-events-none absolute left-1/2 top-6 z-40 hidden w-72 -translate-x-1/2 rounded-xl border border-border bg-slate-950 px-3 py-2 text-xs font-normal leading-5 text-white shadow-xl group-hover:block group-focus-within:block">
              {hint}
              <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-slate-950" />
            </span>
          </span>
        ) : null}
      </span>

      {React.isValidElement(children)
        ? React.cloneElement(
            children as React.ReactElement<Record<string, unknown>>,
            {
              id: controlId,
              "aria-describedby": feedback ? feedbackId : undefined,
            },
          )
        : children}
      {feedback ? (
        <span
          id={feedbackId}
          className={[
            "block text-xs leading-5",
            feedbackTone,
            touched || dirty || validationStatus ? "" : "",
          ].join(" ")}
        >
          {feedback}
        </span>
      ) : null}
    </label>
  );
}

const baseInputClassName =
  "w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted";

function controlClassName(error?: string, validationStatus?: string) {
  if (error || validationStatus === "error") {
    return `${baseInputClassName} border-danger focus:border-danger focus:ring-danger/20`;
  }

  if (validationStatus === "warning") {
    return `${baseInputClassName} border-amber-400 focus:border-amber-500 focus:ring-amber-500/20`;
  }

  return baseInputClassName;
}

function calculateFloatingMenuPosition(rect: DOMRect) {
  const viewportHeight = window.innerHeight;
  const verticalGap = 8;
  const viewportPadding = 16;
  const minMenuHeight = 220;
  const preferredMenuHeight = 360;
  const spaceBelow = viewportHeight - rect.bottom - viewportPadding;
  const spaceAbove = rect.top - viewportPadding;
  const openAbove = spaceBelow < minMenuHeight && spaceAbove > spaceBelow;
  const availableHeight = openAbove ? spaceAbove : spaceBelow;
  const maxHeight = Math.max(
    160,
    Math.min(preferredMenuHeight, availableHeight - verticalGap),
  );

  return {
    left: Math.max(viewportPadding, rect.left),
    top: openAbove
      ? Math.max(viewportPadding, rect.top - maxHeight - verticalGap)
      : rect.bottom + verticalGap,
    width: Math.max(rect.width, 260),
    maxHeight,
  };
}

export function SelectField({
  label,
  hint,
  onChange,
  options,
  placeholder = "Select an option",
  required,
  value,
  className,
  disabled,
  error,
  warning,
  touched,
  dirty,
  validationStatus,
}: BaseFieldProps & {
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  value: string;
  disabled?: boolean;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  // `role="combobox"` requires `aria-controls` and `aria-expanded`; without them
  // a screen reader announces a combobox whose popup it cannot find. BUG-0043.
  const listboxId = React.useId();
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = React.useState(false);
  /*
   * BUG-1956 — which option the keyboard is on. The popup had none: it was a
   * list of buttons, so moving through it meant Tab, and the combobox never
   * set `aria-activedescendant` because there was no descendant to name.
   */
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const [menuPosition, setMenuPosition] = React.useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const selectedOption =
    options.find((option) => (option.value ?? option.id ?? "") === value) ??
    null;
  const selectedLabel =
    selectedOption?.label ??
    selectedOption?.name ??
    selectedOption?.value ??
    selectedOption?.id ??
    "";

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  React.useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    const updatePosition = () => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      setMenuPosition(calculateFloatingMenuPosition(rect));
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  function handleOpen() {
    if (disabled) return;
    setIsOpen((current) => !current);
  }

  function handleSelect(nextValue: string) {
    onChange(nextValue);
    setIsOpen(false);
  }

  const selectMenu =
    isOpen && menuPosition
      ? createPortal(
          <div
            className="fixed z-[80] rounded-2xl border border-border bg-white p-2 shadow-xl"
            id={listboxId}
            ref={menuRef}
            role="listbox"
            style={{
              left: menuPosition.left,
              top: menuPosition.top,
              width: `min(${menuPosition.width}px, calc(100vw - 2rem))`,
              maxHeight: menuPosition.maxHeight,
            }}
          >
            <div
              className="overflow-y-auto"
              style={{ maxHeight: menuPosition.maxHeight - 16 }}
            >
              <button
                className={[
                  "block w-full rounded-xl border px-4 py-3 text-left text-sm transition",
                  value
                    ? "border-transparent hover:border-border hover:bg-slate-50"
                    : "border-accent bg-accent/5",
                ].join(" ")}
                onClick={() => handleSelect("")}
                type="button"
              >
                <span className="text-muted">{placeholder}</span>
              </button>
              {options.map((option, index) => {
                const optionValue = option.value ?? option.id ?? "";
                const optionLabel = option.label ?? option.name ?? optionValue;
                const isSelected = optionValue === value;

                return (
                  <button
                    className={[
                      "mt-1 block w-full rounded-xl border px-4 py-3 text-left text-sm transition",
                      isSelected
                        ? "border-accent bg-accent/5 text-foreground"
                        : "border-transparent text-foreground hover:border-border hover:bg-slate-50",
                    ].join(" ")}
                    key={option.id ?? option.value ?? `${label}-${index}`}
                    onClick={() => handleSelect(optionValue)}
                    type="button"
                  >
                    {optionLabel}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <FieldShell
      className={className}
      hint={hint}
      label={label}
      required={required}
      error={error}
      warning={warning}
      touched={touched}
      dirty={dirty}
      validationStatus={validationStatus}
    >
      <div className="relative" ref={containerRef}>
        <div
          aria-controls={listboxId}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-invalid={Boolean(error)}
          className={[
            controlClassName(error, validationStatus),
            "flex items-center justify-between gap-3 text-left",
            disabled ? "" : "cursor-pointer",
          ].join(" ")}
          onClick={handleOpen}
          onKeyDown={(event) => {
            if (disabled) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleOpen();
            }
            if (event.key === "Escape") {
              setIsOpen(false);
            }
          }}
          role="combobox"
          tabIndex={disabled ? -1 : 0}
        >
          <span
            className={[
              "min-w-0 flex-1 truncate",
              selectedLabel ? "text-foreground" : "text-muted",
            ].join(" ")}
          >
            {selectedLabel || placeholder}
          </span>
          <span aria-hidden="true" className="text-muted">
            ▾
          </span>
        </div>
        {selectMenu}
      </div>
      {false ? (
        <select
          aria-invalid={Boolean(error)}
          className={controlClassName(error, validationStatus)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        >
          <option value="">{placeholder}</option>
          {options.map((option, index) => {
            const optionValue = option.value ?? option.id ?? "";
            const optionLabel = option.label ?? option.name ?? optionValue;

            return (
              <option
                key={option.id ?? option.value ?? `${label}-${index}`}
                value={optionValue}
              >
                {optionLabel}
              </option>
            );
          })}
        </select>
      ) : null}
    </FieldShell>
  );
}

export function DateField({
  label,
  hint,
  value,
  onChange,
  required,
  className,
  disabled,
  min,
  max,
  error,
  warning,
  touched,
  dirty,
  validationStatus,
}: BaseFieldProps & {
  value: string; // format: yyyy-MM-dd
  onChange: (value: string) => void;
  disabled?: boolean;
  min?: string; // yyyy-MM-dd
  max?: string; // yyyy-MM-dd
}) {
  return (
    <FieldShell
      className={className}
      hint={hint}
      label={label}
      required={required}
      error={error}
      warning={warning}
      touched={touched}
      dirty={dirty}
      validationStatus={validationStatus}
    >
      <input
        type="date"
        aria-invalid={Boolean(error)}
        className={controlClassName(error, validationStatus)}
        value={value ?? ""}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldShell>
  );
}

export function TimeField({
  label,
  hint,
  value,
  onChange,
  required,
  className,
  disabled,
  error,
  warning,
  touched,
  dirty,
  validationStatus,
}: BaseFieldProps & {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <FieldShell
      className={className}
      hint={hint}
      label={label}
      required={required}
      error={error}
      warning={warning}
      touched={touched}
      dirty={dirty}
      validationStatus={validationStatus}
    >
      <input
        aria-invalid={Boolean(error)}
        className={controlClassName(error, validationStatus)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        type="time"
        value={value}
      />
    </FieldShell>
  );
}

export function TextField({
  label,
  hint,
  onChange,
  placeholder,
  required,
  value,
  className,
  disabled,
  type = "text",
  variant = "default",
  maxLength,
  error,
  warning,
  touched,
  dirty,
  validationStatus,
  autoComplete,
  ariaLabel,
}: BaseFieldProps & {
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
  disabled?: boolean;
  type?: "text" | "email" | "url" | "password" | "search";
  variant?: TextFieldVariant;
  maxLength?: number;
  /*
   * What a password manager should put here. Absent, browsers guess from the
   * surrounding markup and get it wrong — the tenant login's password field had
   * none at all, so nothing offered to fill it (BUG-1655).
   */
  autoComplete?: string;
  /*
   * An accessible name for a field whose visible label is hidden. The login
   * screen renders `label=""` with the shell's span suppressed so the heading
   * row can hold the "Forgot password?" link, which left the control with no
   * name at all for a screen reader.
   */
  ariaLabel?: string;
}) {
  function formatCNIC(input: string) {
    const digits = input.replace(/\D/g, "").slice(0, 13);

    const part1 = digits.slice(0, 5);
    const part2 = digits.slice(5, 12);
    const part3 = digits.slice(12, 13);

    let formatted = part1;
    if (part2) formatted += `-${part2}`;
    if (part3) formatted += `-${part3}`;

    return formatted;
  }

  function handleChange(rawValue: string) {
    if (variant === "cnic") {
      onChange(formatCNIC(rawValue));
      return;
    }

    onChange(rawValue);
  }

  function isValidCNIC(input: string) {
    return /^\d{5}-\d{7}-\d{1}$/.test(input);
  }

  const showError =
    variant === "cnic" && value.length > 0 && !isValidCNIC(value);
  const errorMessage =
    error ??
    (showError ? "Invalid CNIC format. Use XXXXX-XXXXXXX-X" : undefined);

  return (
    <FieldShell
      className={className}
      hint={hint}
      label={label}
      required={required}
      error={errorMessage}
      warning={warning}
      touched={touched}
      dirty={dirty}
      validationStatus={validationStatus}
    >
      <input
        aria-invalid={Boolean(errorMessage)}
        aria-label={ariaLabel}
        autoComplete={autoComplete}
        className={controlClassName(errorMessage, validationStatus)}
        disabled={disabled}
        onChange={(event) => handleChange(event.target.value)}
        placeholder={
          placeholder ?? (variant === "cnic" ? "12345-1234567-1" : undefined)
        }
        type={type}
        value={value}
        maxLength={variant === "cnic" ? 15 : maxLength}
        inputMode={variant === "cnic" ? "numeric" : undefined}
      />
    </FieldShell>
  );
}

export function NumberField({
  label,
  hint,
  onChange,
  placeholder,
  required,
  value,
  className,
  disabled,
  min,
  max,
  step = 1,
  error,
  warning,
  touched,
  dirty,
  validationStatus,
}: BaseFieldProps & {
  onChange: (value: number | null) => void;
  placeholder?: string;
  value: number | null;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <FieldShell
      className={className}
      hint={hint}
      label={label}
      required={required}
      error={error}
      warning={warning}
      touched={touched}
      dirty={dirty}
      validationStatus={validationStatus}
    >
      <input
        aria-invalid={Boolean(error)}
        className={controlClassName(error, validationStatus)}
        disabled={disabled}
        max={max}
        min={min}
        onChange={(event) => {
          const nextValue = event.target.value;
          onChange(nextValue === "" ? null : Number(nextValue));
        }}
        placeholder={placeholder}
        step={step}
        type="number"
        value={value ?? ""}
      />
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  hint,
  onChange,
  placeholder,
  required,
  value,
  className,
  disabled,
  rows = 4,
  error,
  warning,
  touched,
  dirty,
  validationStatus,
}: BaseFieldProps & {
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
  disabled?: boolean;
  rows?: number;
}) {
  return (
    <FieldShell
      className={className}
      hint={hint}
      label={label}
      required={required}
      error={error}
      warning={warning}
      touched={touched}
      dirty={dirty}
      validationStatus={validationStatus}
    >
      <textarea
        aria-invalid={Boolean(error)}
        className={`${controlClassName(error, validationStatus)} min-h-24 resize-y`}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        value={value}
      />
    </FieldShell>
  );
}

export function CheckboxField({
  label,
  hint,
  onChange,
  checked,
  className,
  disabled,
  error,
  warning,
}: Omit<BaseFieldProps, "required"> & {
  onChange: (checked: boolean) => void;
  checked: boolean;
  disabled?: boolean;
}) {
  const generatedId = React.useId();
  const controlId = `field-${generatedId.replace(/:/g, "")}`;
  const feedbackId = `${controlId}-feedback`;
  return (
    <label
      htmlFor={controlId}
      className={[
        "flex items-start gap-3 text-sm text-foreground",
        disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <input
        id={controlId}
        checked={checked}
        aria-invalid={Boolean(error)}
        aria-describedby={error || warning ? feedbackId : undefined}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-accent focus:ring-2 focus:ring-accent/20"
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />

      <span className="min-w-0 flex-1">
        <span className="block whitespace-normal break-words leading-5">
          {label}
        </span>

        {hint ? (
          <span className="mt-1 block text-xs leading-5 text-muted">
            {hint}
          </span>
        ) : null}
        {error || warning ? (
          <span
            id={feedbackId}
            className={`mt-1 block text-xs leading-5 ${
              error ? "text-danger" : "text-amber-700"
            }`}
          >
            {error ?? warning}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export function MultiSelectField({
  label,
  hint,
  onChange,
  options,
  required,
  value,
  className,
  disabled,
  error,
  warning,
  touched,
  dirty,
  validationStatus,
}: BaseFieldProps & {
  onChange: (value: string[]) => void;
  options: readonly SelectOption[];
  value: string[];
  disabled?: boolean;
}) {
  const selected = new Set(value);

  return (
    <FieldShell
      className={className}
      hint={hint}
      label={label}
      required={required}
      error={error}
      warning={warning}
      touched={touched}
      dirty={dirty}
      validationStatus={validationStatus}
    >
      <div
        aria-invalid={Boolean(error)}
        className={[
          "grid gap-2 rounded-2xl border bg-white p-3",
          error ? "border-danger" : "border-border",
        ].join(" ")}
      >
        {options.map((option, index) => {
          const optionValue = option.value ?? option.id ?? "";
          const optionLabel = option.label ?? option.name ?? optionValue;
          const checked = selected.has(optionValue);

          return (
            <label
              className={[
                "flex items-center gap-3 text-sm",
                disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer",
              ].join(" ")}
              key={option.id ?? option.value ?? `${label}-${index}`}
            >
              <input
                checked={checked}
                className="h-4 w-4 rounded border-border text-accent focus:ring-accent/20"
                disabled={disabled}
                onChange={() => {
                  const next = new Set(value);

                  if (checked) {
                    next.delete(optionValue);
                  } else {
                    next.add(optionValue);
                  }

                  onChange(Array.from(next));
                }}
                type="checkbox"
              />

              <span className="text-foreground">{optionLabel}</span>
            </label>
          );
        })}
      </div>
    </FieldShell>
  );
}

export function LookupField({
  label,
  hint,
  onChange,
  options,
  placeholder = "Search and select",
  required,
  value,
  className,
  disabled,
  noResultsText = "No matching records found.",
  onSearch,
  error,
  warning,
  touched,
  dirty,
  validationStatus,
  selectedHref,
}: BaseFieldProps & {
  onChange: (value: string) => void;
  onSearch?: (query: string) => void;
  options: LookupOption[];
  placeholder?: string;
  value: string;
  disabled?: boolean;
  noResultsText?: string;
  selectedHref?: string;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  // See SelectField: a combobox must name the popup it controls, and this one
  // did not even report whether it was open. BUG-0043.
  const listboxId = React.useId();
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const [isOpen, setIsOpen] = React.useState(false);
  const [menuPosition, setMenuPosition] = React.useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [query, setQuery] = React.useState("");
  const onSearchRef = React.useRef(onSearch);

  const uniqueOptions = React.useMemo(
    () => dedupeLookupOptions(options),
    [options],
  );

  const selectedOption = React.useMemo(
    () =>
      uniqueOptions.find((option) => lookupOptionMatchesValue(option, value)) ??
      null,
    [uniqueOptions, value],
  );

  const filteredOptions = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return uniqueOptions;
    }

    return uniqueOptions.filter((option) => {
      const haystack = [option.name, option.subtitle ?? ""]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [uniqueOptions, query]);

  React.useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  React.useEffect(() => {
    onSearchRef.current?.(query);
  }, [query]);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setIsOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  React.useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    const updatePosition = () => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const verticalGap = 8;
      const viewportPadding = 16;
      const minMenuHeight = 140;
      const preferredMenuHeight = 360;
      const spaceBelow = viewportHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const openAbove = spaceBelow < minMenuHeight && spaceAbove > spaceBelow;
      const availableHeight = openAbove ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(
        minMenuHeight,
        Math.min(preferredMenuHeight, availableHeight - verticalGap),
      );

      setMenuPosition({
        left: Math.max(16, rect.left),
        top: openAbove
          ? Math.max(viewportPadding, rect.top - maxHeight - verticalGap)
          : rect.bottom + verticalGap,
        width: Math.max(rect.width, 260),
        maxHeight,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  function handleOpen() {
    if (disabled) return;
    setIsOpen(true);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }

  function handleSelect(
    optionId: string,
    event: React.MouseEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    onChange(optionId);
    setIsOpen(false);
    setQuery("");
  }

  function handleClear(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    onChange("");
    setQuery("");
    setIsOpen(false);
  }

  const lookupMenu =
    isOpen && menuPosition
      ? createPortal(
          <div
            className="fixed z-[80] rounded-2xl border border-border bg-white p-3 shadow-xl"
            id={listboxId}
            ref={menuRef}
            style={{
              left: menuPosition.left,
              top: menuPosition.top,
              width: `min(${menuPosition.width}px, calc(100vw - 2rem))`,
              maxHeight: menuPosition.maxHeight,
            }}
          >
            <div className="mb-3 flex items-center gap-2">
              <input
                ref={inputRef}
                className={baseInputClassName}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={placeholder}
                value={query}
              />
              {value ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleClear}
                  type="button"
                >
                  Clear
                </Button>
              ) : null}
            </div>

            <div
              className="overflow-y-auto"
              style={{ maxHeight: Math.max(120, menuPosition.maxHeight - 92) }}
            >
              {filteredOptions.length ? (
                <div className="space-y-1">
                  {filteredOptions.map((option) => {
                    const isSelected = lookupOptionMatchesValue(option, value);
                    const display = lookupOptionDisplay(option);

                    return (
                      <button
                        key={option.id}
                        onClick={(event) => handleSelect(option.id, event)}
                        type="button"
                        className={[
                          "block w-full rounded-xl border px-4 py-3 text-left transition",
                          isSelected
                            ? "border-accent bg-accent/5"
                            : "border-transparent hover:border-border hover:bg-slate-50",
                        ].join(" ")}
                      >
                        <span className="block text-xs font-medium text-foreground">
                          {display.name}
                        </span>

                        {option.subtitle ? (
                          <span className="block text-xs text-muted">
                            {option.subtitle}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted">
                  {noResultsText}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <FieldShell
      className={className}
      hint={hint}
      label={label}
      required={required}
      error={error}
      warning={warning}
      touched={touched}
      dirty={dirty}
      validationStatus={validationStatus}
    >
      <div className="relative" ref={containerRef}>
        <div
          aria-controls={listboxId}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          className={[
            controlClassName(error, validationStatus),
            "flex items-center justify-between gap-3 text-left",
            disabled ? "" : "cursor-pointer",
          ].join(" ")}
          onClick={handleOpen}
          onKeyDown={(event) => {
            if (disabled) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleOpen();
            }
          }}
          role="combobox"
          tabIndex={disabled ? -1 : 0}
        >
          <span className="min-w-0 flex-1">
            {selectedOption ? (
              <span className="block min-w-0">
                {selectedHref ? (
                  <a
                    className="block truncate font-semibold text-accent underline-offset-4 hover:underline"
                    href={selectedHref}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {lookupOptionDisplay(selectedOption).name}
                  </a>
                ) : (
                  <span className="block truncate font-medium text-foreground">
                    {lookupOptionDisplay(selectedOption).name}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted">{placeholder}</span>
            )}
          </span>

          <span className="flex min-w-0 shrink-0 items-center gap-2">
            {value ? (
              <span
                aria-hidden="true"
                className="rounded-full bg-slate-100 px-[4px] py-[2px] text-[9px] font-medium text-muted"
              >
                Selected
              </span>
            ) : null}
            <span aria-hidden="true" className="text-muted">
              ▾
            </span>
          </span>
        </div>

        {lookupMenu}
        {false && isOpen ? (
          <div className="absolute z-30 mt-2 w-full rounded-2xl border border-border bg-white p-3 shadow-xl">
            <div className="mb-3 flex items-center gap-2">
              <input
                ref={inputRef}
                className={baseInputClassName}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={placeholder}
                value={query}
              />
              {value ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleClear}
                  type="button"
                >
                  Clear
                </Button>
              ) : null}
            </div>

            <div className="max-h-64 overflow-y-auto">
              {filteredOptions.length ? (
                <div className="space-y-1">
                  {filteredOptions.map((option) => {
                    const isSelected = option.id === value;
                    const display = lookupOptionDisplay(option);

                    return (
                      <button
                        key={option.id}
                        onClick={(event) => handleSelect(option.id, event)}
                        type="button"
                        className={[
                          "block w-full rounded-xl border px-4 py-3 text-left transition",
                          isSelected
                            ? "border-accent bg-accent/5"
                            : "border-transparent hover:border-border hover:bg-slate-50",
                        ].join(" ")}
                      >
                        <span className="block font-medium text-foreground">
                          {display.name}
                        </span>

                        {false &&
                        (option.code || option.key || option.subtitle) ? (
                          <span className="block text-xs text-muted">
                            {[option.code, option.key, option.subtitle]
                              .filter(Boolean)
                              .join(" • ")}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted">
                  {noResultsText}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </FieldShell>
  );
}

function lookupOptionDisplay(option: LookupOption) {
  const code = cleanLookupText(option.code);
  const rawName = option.name.trim();
  const name =
    code && rawName.endsWith(code)
      ? rawName.slice(0, -code.length).trim() || rawName
      : rawName;

  return { name };
}

function cleanLookupText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function dedupeLookupOptions(options: readonly LookupOption[]) {
  const result: LookupOption[] = [];
  const seen = new Set<string>();

  for (const option of options) {
    const key =
      cleanLookupText(option.id).toLowerCase() ||
      cleanLookupText(option.key).toLowerCase() ||
      cleanLookupText(option.code).toLowerCase() ||
      cleanLookupText(option.name).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(option);
  }

  return result;
}

function lookupOptionMatchesValue(option: LookupOption, value: string) {
  const normalizedValue = cleanLookupText(value).toLowerCase();
  if (!normalizedValue) return false;

  return [option.id, option.code, option.key, option.name]
    .map((item) => cleanLookupText(item).toLowerCase())
    .some((candidate) => candidate === normalizedValue);
}
