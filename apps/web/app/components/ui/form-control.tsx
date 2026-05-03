import * as React from "react";

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
  subtitle?: string | null;
};

type TextFieldVariant = "default" | "cnic";

type BaseFieldProps = {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
};

function FieldShell({
  label,
  hint,
  required,
  className,
  children,
}: BaseFieldProps & { children: React.ReactNode }) {
  return (
    <label className={["block space-y-2 text-sm", className].filter(Boolean).join(" ")}>
      <span className="flex items-center gap-1.5 font-medium text-foreground">
        <span>
          {label}
          {required ? <span className="ml-1 text-danger">*</span> : null}
        </span>

        {hint ? (
          <span className="group relative inline-flex">
            <button
              type="button"
              tabIndex={0}
              aria-label={`${label} help`}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border bg-slate-50 text-[10px] font-semibold leading-none text-muted transition hover:border-accent hover:bg-accent/5 hover:text-accent focus:border-accent focus:bg-accent/5 focus:text-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              onClick={(event) => event.preventDefault()}
            >
              i
            </button>

            <span className="pointer-events-none absolute left-1/2 top-6 z-40 hidden w-72 -translate-x-1/2 rounded-xl border border-border bg-slate-950 px-3 py-2 text-xs font-normal leading-5 text-white shadow-xl group-hover:block group-focus-within:block">
              {hint}
              <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-slate-950" />
            </span>
          </span>
        ) : null}
      </span>

      {children}
    </label>
  );
}

const baseInputClassName =
  "w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted";

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
}: BaseFieldProps & {
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  value: string;
  disabled?: boolean;
}) {
  return (
    <FieldShell
      className={className}
      hint={hint}
      label={label}
      required={required}
    >
      <select
        className={baseInputClassName}
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
    >
      <input
        type="date"
        className={baseInputClassName}
        value={value ?? ""}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
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
}: BaseFieldProps & {
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
  disabled?: boolean;
  type?: "text" | "email" | "url" | "password" | "search";
  variant?: TextFieldVariant;
  maxLength?: number;
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

  return (
    <FieldShell
      className={className}
      hint={showError ? "Invalid CNIC format. Use XXXXX-XXXXXXX-X" : hint}
      label={label}
      required={required}
    >
      <input
        className={`${baseInputClassName} ${
          showError ? "border-red-500 focus:border-red-500" : ""
        }`}
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
    >
      <input
        className={baseInputClassName}
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
    >
      <textarea
        className={`${baseInputClassName} min-h-24 resize-y`}
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
}: Omit<BaseFieldProps, "required"> & {
  onChange: (checked: boolean) => void;
  checked: boolean;
  disabled?: boolean;
}) {
  return (
    <label
      className={[
        "flex items-start gap-3 rounded-2xl bg-white px-4 py-3 text-sm",
        disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <input
        checked={checked}
        className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent/20"
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span className="space-y-1">
        <span className="block font-medium text-foreground">{label}</span>
        {hint ? <span className="block text-xs leading-5 text-muted">{hint}</span> : null}
      </span>
    </label>
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
}: BaseFieldProps & {
  onChange: (value: string) => void;
  options: LookupOption[];
  placeholder?: string;
  value: string;
  disabled?: boolean;
  noResultsText?: string;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const [isOpen, setIsOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const selectedOption = React.useMemo(
    () => options.find((option) => option.id === value) ?? null,
    [options, value],
  );

  const filteredOptions = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) => {
      const haystack = [
        option.name,
        option.code ?? "",
        option.key ?? "",
        option.subtitle ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [options, query]);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleOpen() {
    if (disabled) return;
    setIsOpen(true);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }

  function handleSelect(optionId: string) {
    onChange(optionId);
    setIsOpen(false);
    setQuery("");
  }

  function handleClear() {
    onChange("");
    setQuery("");
    setIsOpen(false);
  }

  return (
    <FieldShell
      className={className}
      hint={hint}
      label={label}
      required={required}
    >
      <div className="relative" ref={containerRef}>
        <button
          className={[
            baseInputClassName,
            "flex items-center justify-between gap-3 text-left",
            disabled ? "" : "cursor-pointer",
          ].join(" ")}
          disabled={disabled}
          onClick={handleOpen}
          type="button"
        >
          <span className="min-w-0 flex-1">
            {selectedOption ? (
              <span className="block min-w-0">
                <span className="block truncate font-medium text-foreground">
                  {selectedOption.name}
                </span>
              </span>
            ) : (
              <span className="text-muted">{placeholder}</span>
            )}
          </span>

          <span className="flex items-center gap-2">
            {value ? (
              <span
                aria-hidden="true"
                className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-muted"
              >
                Selected
              </span>
            ) : null}
            <span aria-hidden="true" className="text-muted">
              ▾
            </span>
          </span>
        </button>

        {isOpen ? (
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
                <button
                  className="shrink-0 rounded-xl border border-border bg-white px-3 py-3 text-xs font-medium text-muted transition hover:bg-slate-50"
                  onClick={handleClear}
                  type="button"
                >
                  Clear
                </button>
              ) : null}
            </div>

            <div className="max-h-64 overflow-y-auto">
              {filteredOptions.length ? (
                <div className="space-y-1">
                  {filteredOptions.map((option) => {
                    const isSelected = option.id === value;

                    return (
                      <button
                        key={option.id}
                        className={[
                          "w-full rounded-xl border px-3 py-2.5 text-left transition",
                          isSelected
                            ? "border-accent bg-accent/5"
                            : "border-transparent hover:border-border hover:bg-slate-50",
                        ].join(" ")}
                        onClick={() => handleSelect(option.id)}
                        type="button"
                      >
                        <span className="block font-medium text-foreground">
                          {option.name}
                        </span>
                        {option.code || option.key || option.subtitle ? (
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