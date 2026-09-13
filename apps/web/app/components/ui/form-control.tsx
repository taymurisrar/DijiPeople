import * as React from "react";
import {
  activeDescendantId,
  listboxOptionId,
  nextActiveIndex,
} from "@/lib/a11y/listbox-navigation";
import {
  buildLookupTruncationMessage,
  createDebouncedCallback,
  LOOKUP_SEARCH_DEBOUNCE_MS,
  resolveVisibleSelectedOption,
} from "@/lib/runtime/lookup-search";
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
  /*
   * ITEM-0163 — the selected record's name as a link, rendered in the label
   * row rather than as a separate line under the control. A `label` element is
   * not the combobox, so this is safe where BUG-1956 said a link *inside* the
   * combobox trigger was not: the trigger keeps click-to-open as its only
   * behaviour, which is what its ARIA contract promises.
   */
  labelLink?: { href: string; text: string };
};

function FieldShell({
  dirty,
  error,
  label,
  labelId,
  hint,
  labelLink,
  required,
  touched,
  validationStatus,
  warning,
  className,
  children,
}: BaseFieldProps & {
  children: React.ReactNode;
  /*
   * Id for the visible label text. A combobox is a `div`, which `label htmlFor`
   * cannot name, so `SelectField` and `LookupField` point `aria-labelledby` at
   * this instead (ITEM-0184 — every select in the customization dialogs was
   * announced with no name).
   */
  labelId?: string;
}) {
  const generatedId = React.useId();
  const controlId = `field-${generatedId.replace(/:/g, "")}`;
  const feedbackId = `${controlId}-feedback`;
  /*
   * ITEM-0183 — a hint renders once, as the line under the control. It used to
   * render a second time inside an "i" tooltip beside the label, so every hint
   * on every field appeared twice.
   */
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
      <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
        <span id={labelId}>
          {label}
          {required ? <span className="ml-1 text-danger">*</span> : null}
        </span>

        {labelLink ? (
          <a
            className="min-w-0 max-w-[12rem] truncate text-xs font-semibold text-accent underline-offset-4 hover:underline"
            href={labelLink.href}
            title={labelLink.text}
          >
            {labelLink.text}
          </a>
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

/*
 * BUG-3495 — Escape inside an open listbox closes the listbox, not the dialog
 * around it.
 *
 * `useDialogBehavior` listens for Escape on `document` in the capture phase, so
 * it ran before any control inside the dialog saw the key: pressing Escape to
 * dismiss a dropdown closed the whole dialog and threw away everything typed.
 * An open listbox therefore listens on `window` in the capture phase, which runs
 * before `document`, closes itself and stops the event there. Only while open —
 * with every listbox closed, Escape reaches the dialog exactly as before.
 */
export function closeListboxOnEscape(
  event: Pick<KeyboardEvent, "key" | "preventDefault" | "stopPropagation">,
  close: () => void,
): boolean {
  if (event.key !== "Escape") return false;
  event.preventDefault();
  event.stopPropagation();
  close();
  return true;
}

export function useListboxEscape(isOpen: boolean, close: () => void) {
  const closeRef = React.useRef(close);

  React.useEffect(() => {
    closeRef.current = close;
  }, [close]);

  React.useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      closeListboxOnEscape(event, () => closeRef.current());
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen]);
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
  const labelId = `${listboxId}-label`;
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = React.useState(false);
  /*
   * BUG-1956 — which option the keyboard is on. The popup had none: it was a
   * list of buttons, so moving through it meant Tab, and the combobox never
   * set `aria-activedescendant` because there was no descendant to name.
   */
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const closeListbox = React.useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);
  useListboxEscape(isOpen, closeListbox);
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

  /*
   * BUG-1956 — the popup's rows, as options rather than as buttons. The
   * placeholder row is one of them: it is a choice ("none"), and leaving it
   * out of the list would make the keyboard unable to reach the only way to
   * clear the field.
   */
  const entries = React.useMemo(
    () => [
      { value: "", label: placeholder, key: "__placeholder" },
      ...options.map((option, index) => {
        const optionValue = option.value ?? option.id ?? "";
        return {
          value: optionValue,
          label: option.label ?? option.name ?? optionValue,
          key: option.id ?? option.value ?? `${label}-${index}`,
        };
      }),
    ],
    [label, options, placeholder],
  );

  function handleOpen() {
    if (disabled) return;
    setIsOpen((current) => {
      const next = !current;
      // Opening highlights whatever is selected, so the first arrow press
      // moves from where the user is rather than from the top of the list.
      if (next) {
        setActiveIndex(entries.findIndex((entry) => entry.value === value));
      }
      return next;
    });
  }

  function handleSelect(nextValue: string) {
    onChange(nextValue);
    setIsOpen(false);
    setActiveIndex(-1);
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
              {/*
                BUG-1956 — these were `button` elements. A `listbox` whose
                children are buttons is worse than one with no roles at all:
                the container claims to own options, none exist, and every
                button is a focusable child of a widget role, which is the
                `nested-interactive` violation as well.

                They are `div`s with `role="option"` now, not focusable. The
                keyboard lives on the combobox and moves through them by
                `aria-activedescendant`, which is the pattern the trigger has
                been claiming to implement since the attributes were written.
              */}
              {entries.map((entry, index) => {
                const isSelected = entry.value === value;
                const isActive = index === activeIndex;

                return (
                  /*
                   * The two jsx-a11y rules below are false positives for this
                   * pattern, and silencing them is the deliberate half of
                   * BUG-1956 rather than a shortcut past it.
                   *
                   * In an `aria-activedescendant` listbox the options are
                   * explicitly NOT in the tab order and carry no key handlers
                   * of their own: the combobox keeps focus, owns the arrow and
                   * Enter handling, and points at the active option by id. That
                   * is the pattern the trigger's ARIA attributes have claimed
                   * all along. Satisfying the rules literally — giving each
                   * option a tabIndex and its own onKeyDown — would rebuild the
                   * roving-focus variant instead, contradict the
                   * `aria-activedescendant` the combobox advertises, and leave
                   * a screen reader with two competing accounts of where focus
                   * is. The rules cannot see which of the two listbox patterns
                   * is in play; they assume roving focus.
                   */
                  // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
                  <div
                    aria-selected={isSelected}
                    className={[
                      index === 0 ? "" : "mt-1",
                      "block w-full cursor-pointer rounded-xl border px-4 py-3 text-left text-sm transition",
                      isSelected
                        ? "border-accent bg-accent/5 text-foreground"
                        : "border-transparent text-foreground hover:border-border hover:bg-slate-50",
                      isActive ? "border-border bg-slate-50" : "",
                    ].join(" ")}
                    id={listboxOptionId(listboxId, index)}
                    key={entry.key}
                    onClick={() => handleSelect(entry.value)}
                    onMouseEnter={() => setActiveIndex(index)}
                    role="option"
                  >
                    {index === 0 ? (
                      <span className="text-muted">{entry.label}</span>
                    ) : (
                      entry.label
                    )}
                  </div>
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
      labelId={labelId}
      validationStatus={validationStatus}
    >
      <div className="relative" ref={containerRef}>
        <div
          aria-labelledby={labelId}
          aria-activedescendant={activeDescendantId(
            listboxId,
            isOpen,
            activeIndex,
            entries.length,
          )}
          /*
            BUG-1956 — `aria-controls` only while the popup exists. It named a
            portalled element that is not rendered when the field is closed,
            which is a dangling reference for most of the control's life.
          */
          aria-controls={isOpen ? listboxId : undefined}
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

            /*
              BUG-1956 — arrowing through the options. There was none: the
              rows were buttons, so moving through them meant Tab, and Tab out
              of an open popup left it open behind the next control.
            */
            const moved = nextActiveIndex(
              event.key,
              activeIndex,
              entries.length,
            );
            if (moved !== null) {
              event.preventDefault();
              setActiveIndex(moved);
              if (!isOpen) setIsOpen(true);
              return;
            }

            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (isOpen && activeIndex >= 0 && activeIndex < entries.length) {
                handleSelect(entries[activeIndex].value);
                return;
              }
              handleOpen();
            }
            if (event.key === "Escape") {
              setIsOpen(false);
              setActiveIndex(-1);
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
  resultsTruncated,
}: BaseFieldProps & {
  onChange: (value: string) => void;
  onSearch?: (query: string) => void;
  options: LookupOption[];
  placeholder?: string;
  value: string;
  disabled?: boolean;
  noResultsText?: string;
  selectedHref?: string;
  /*
   * BUG-3376 — set by a caller whose `onSearch` fetch returned a page as long
   * as it asked for, so more matches may exist than are on screen. The control
   * never infers this itself: it only knows the `options` it was given, not
   * how many records actually satisfy the query server-side.
   */
  resultsTruncated?: boolean;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  // See SelectField: a combobox must name the popup it controls, and this one
  // did not even report whether it was open. BUG-0043.
  const listboxId = React.useId();
  const labelId = `${listboxId}-label`;
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
  /*
   * BUG-1956 — which option the keyboard is on. This control announced
   * `aria-haspopup="listbox"` and `aria-controls`, and the element it named
   * was a bare `div` of `button`s: no `role="listbox"`, no `role="option"`,
   * no `aria-selected`, and `aria-activedescendant` never set. A screen
   * reader was told a list existed and given nothing to move through.
   */
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const closeLookup = React.useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);
  useListboxEscape(isOpen, closeLookup);
  const onSearchRef = React.useRef(onSearch);

  const uniqueOptions = React.useMemo(
    () => dedupeLookupOptions(options),
    [options],
  );

  const directSelectedOption = React.useMemo(
    () =>
      uniqueOptions.find((option) => lookupOptionMatchesValue(option, value)) ??
      null,
    [uniqueOptions, value],
  );

  /*
   * BUG-3376 — "keep the currently selected record pinned into the option
   * list so an existing value never disappears while searching". A caller
   * doing server-side search replaces `options` with whatever the query
   * matched, which will not include the previously selected record once the
   * user types something else. `previousSelectedRef` remembers the last
   * option that *did* resolve for the current `value`, so the trigger keeps
   * showing its label instead of quietly falling back to the placeholder —
   * indistinguishable, to the user, from the field having been cleared. See
   * `resolveVisibleSelectedOption` for the exact rule, including why it drops
   * the memory the instant `value` itself changes.
   */
  const [previousSelected, setPreviousSelected] = React.useState<{
    value: string;
    option: LookupOption;
  } | null>(null);
  // Plain state rather than a ref: reading `.current` inside the render body
  // to compute `selectedOption` is exactly the pattern
  // `react-hooks/refs` exists to catch, because nothing then forces a
  // re-render when the remembered option changes.
  const selectedOption = resolveVisibleSelectedOption(
    value,
    directSelectedOption,
    previousSelected,
  );

  React.useEffect(() => {
    setPreviousSelected((current) => {
      if (directSelectedOption) {
        if (current?.value === value && current.option === directSelectedOption) {
          return current;
        }
        return { value, option: directSelectedOption };
      }
      return current && current.value !== value ? null : current;
    });
  }, [value, directSelectedOption]);

  /*
   * BUG-3376 — once a caller wires `onSearch`, the request it issues already
   * carries the typed query server-side, and re-filtering the response here
   * with a plain substring match would only ever narrow it further (a server
   * doing token or fuzzy matching can legitimately return a record this
   * control's own substring check would reject). Without `onSearch`, nothing
   * else filters the list, so the client-side behaviour every existing caller
   * relies on today is unchanged.
   */
  const filteredOptions = React.useMemo(() => {
    if (onSearch) return uniqueOptions;

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
  }, [uniqueOptions, query, onSearch]);

  /*
   * Typing narrows the list under the highlight, so an index that named the
   * fourth match can outlive a list of two — and `aria-activedescendant` would
   * then point at no element, which is the same class of defect as the one
   * being fixed.
   */
  React.useEffect(() => {
    setActiveIndex((current) =>
      current >= filteredOptions.length ? -1 : current,
    );
  }, [filteredOptions.length]);

  React.useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  /*
   * BUG-3376 — "a debounced refetch that sends both a search term and an
   * explicit page size". Firing on every keystroke (the previous behaviour)
   * turned a five-character name into five requests; the caller only needs
   * the last one.
   *
   * The debounced instance is built inside an effect — never in the render
   * body — and only ever touched from inside effects afterwards, so reading
   * `onSearchRef.current` when the timer eventually fires never happens
   * during render (`react-hooks/refs`).
   */
  const debouncedSearchRef = React.useRef<ReturnType<
    typeof createDebouncedCallback<[string]>
  > | null>(null);

  React.useEffect(() => {
    debouncedSearchRef.current = createDebouncedCallback<[string]>(
      (nextQuery) => onSearchRef.current?.(nextQuery),
      LOOKUP_SEARCH_DEBOUNCE_MS,
    );
    return () => debouncedSearchRef.current?.cancel();
  }, []);

  React.useEffect(() => {
    debouncedSearchRef.current?.run(query);
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
    setActiveIndex(-1);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }

  function handleSelect(optionId: string, event?: React.SyntheticEvent) {
    event?.preventDefault();
    event?.stopPropagation();
    onChange(optionId);
    setIsOpen(false);
    setQuery("");
    setActiveIndex(-1);
  }

  /*
   * The search input is what has focus while the popup is open, so the
   * movement keys are handled there and `aria-activedescendant` is set on it
   * as well as on the trigger — a textbox supports the attribute, and the
   * user must be able to arrow to a record without leaving the box they are
   * typing in.
   */
  function handleListNavigation(event: React.KeyboardEvent) {
    const moved = nextActiveIndex(
      event.key,
      activeIndex,
      filteredOptions.length,
    );
    if (moved !== null) {
      event.preventDefault();
      setActiveIndex(moved);
      return;
    }

    if (event.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
        handleSelect(filteredOptions[activeIndex].id, event);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
    }
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
                aria-activedescendant={activeDescendantId(
                  listboxId,
                  isOpen,
                  activeIndex,
                  filteredOptions.length,
                )}
                aria-controls={filteredOptions.length ? listboxId : undefined}
                aria-label={`Search ${label || "options"}`}
                ref={inputRef}
                className={baseInputClassName}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleListNavigation}
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

            {/*
              BUG-3376 — a truncated page reads as "this record does not
              exist" unless the control says otherwise. Only the caller knows
              whether the page it fetched was cut short, so this is opt-in via
              `resultsTruncated` rather than inferred from the option count.
            */}
            {resultsTruncated && filteredOptions.length ? (
              <p className="mb-2 text-xs text-muted">
                {buildLookupTruncationMessage(filteredOptions.length)}
              </p>
            ) : null}

            <div
              className="overflow-y-auto"
              style={{ maxHeight: Math.max(120, menuPosition.maxHeight - 92) }}
            >
              {/*
                BUG-1956 - `role=listbox` belongs here rather than on the
                popup: the popup also contains the search box and a Clear
                button, and a listbox owning focusable controls is the
                `nested-interactive` violation. The options are `div`s, not
                `button`s, for the same reason - they are reached by
                `aria-activedescendant` from the input, not by Tab.

                Rendered only when there are matches, so the `aria-controls`
                on the trigger and on the input never name an element that
                is not there. The empty state is a sibling: a listbox with
                no options is a list a user is invited to move through and
                cannot.
              */}
              {filteredOptions.length ? (
                <div className="space-y-1" id={listboxId} role="listbox">
                  {filteredOptions.map((option, index) => {
                    const isSelected = lookupOptionMatchesValue(option, value);
                    const isActive = index === activeIndex;
                    const display = lookupOptionDisplay(option);

                    return (
                      /*
                       * Same deliberate exception as the select listbox above:
                       * `aria-activedescendant` keeps focus on the combobox, so
                       * an option must not be focusable and must not carry its
                       * own key handler. See the fuller note at the other call
                       * site.
                       */
                      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
                      <div
                        aria-selected={isSelected}
                        id={listboxOptionId(listboxId, index)}
                        key={option.id}
                        onClick={(event) => handleSelect(option.id, event)}
                        onMouseEnter={() => setActiveIndex(index)}
                        role="option"
                        className={[
                          "block w-full cursor-pointer rounded-xl border px-4 py-3 text-left transition",
                          isSelected
                            ? "border-accent bg-accent/5"
                            : "border-transparent hover:border-border hover:bg-slate-50",
                          isActive ? "border-border bg-slate-50" : "",
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
                      </div>
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
      labelLink={
        selectedOption && selectedHref
          ? { href: selectedHref, text: lookupOptionDisplay(selectedOption).name }
          : undefined
      }
      required={required}
      error={error}
      warning={warning}
      touched={touched}
      dirty={dirty}
      labelId={labelId}
      validationStatus={validationStatus}
    >
      <div className="relative" ref={containerRef}>
        <div
          aria-labelledby={labelId}
          aria-activedescendant={activeDescendantId(
            listboxId,
            isOpen,
            activeIndex,
            filteredOptions.length,
          )}
          /*
            BUG-1956 - `aria-controls` only while there is something to control.
            It named a portalled element that does not exist when the field is
            closed, and does not exist when the search matches nothing either,
            so for most of this control's life it was a dangling reference.
          */
          aria-controls={
            isOpen && filteredOptions.length ? listboxId : undefined
          }
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
              return;
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              handleOpen();
              return;
            }
            if (event.key === "Escape") {
              setIsOpen(false);
              setActiveIndex(-1);
            }
          }}
          role="combobox"
          tabIndex={disabled ? -1 : 0}
        >
          <span className="min-w-0 flex-1">
            {selectedOption ? (
              <span className="block truncate font-medium text-foreground">
                {lookupOptionDisplay(selectedOption).name}
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

        {/*
          ITEM-0163 — the link used to render here, as a sibling line below the
          control (BUG-1956 moved it out of the combobox trigger for exactly
          this reason: a combobox may not own focusable children). The product
          owner then asked for the selected record's name to be the click
          target next to the field's label instead of a separate line under
          the control, so it is rendered by `FieldShell` now via `labelLink`
          above — nothing renders here for that case any more.

          The dead, unreachable `{false && isOpen ? ... : null}` popup that
          used to sit below `lookupMenu` (a superseded copy of the same popup,
          rendered as `button`s rather than an `aria-activedescendant`
          listbox) is deleted rather than kept unreachable — ITEM-0163.
        */}
        {lookupMenu}
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
