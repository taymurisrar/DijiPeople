"use client";

type FormControlOption = {
    value: string;
    label: string;
};

type FormControlType =
    | "text"
    | "email"
    | "number"
    | "password"
    | "tel"
    | "url"
    | "date"
    | "datetime-local"
    | "time"
    | "textarea"
    | "select"
    | "multiselect"
    | "checkbox"
    | "switch"
    | "radio"
    | "currency"
    | "percent"
    | "lookup"
    | "readonly";

type FormControlValue = string | string[] | boolean | number | null;

type FormControlProps = {
    type?: FormControlType;
    label: string;
    value: FormControlValue;
    onChange?: (value: FormControlValue) => void;
    options?: FormControlOption[];
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    error?: string;
    helpText?: string;
};

function FieldLabel({
    label,
    required,
    helpText,
    error,
}: {
    label: string;
    required?: boolean;
    helpText?: string;
    error?: string;
}) {
    return (
        <span className="flex min-h-5 items-center gap-1 text-sm font-medium text-slate-700">
            <span>
                {label}
                {required ? <span className="ml-1 text-red-600">*</span> : null}
            </span>

            {helpText ? (
                <span className="group relative inline-flex">
                    <span className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-slate-300 text-[10px] font-semibold text-slate-500">
                        i
                    </span>

                    <span className="pointer-events-none absolute left-1/2 top-6 z-30 hidden w-64 -translate-x-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-normal leading-5 text-slate-600 shadow-lg group-hover:block">
                        {helpText}
                    </span>
                </span>
            ) : null}

            {error ? (
                <span
                    aria-label={error}
                    className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-50 text-[10px] font-bold text-red-600"
                    title={error}
                >
                    !
                </span>
            ) : null}
        </span>
    );
}

export function FormControl({
    type = "text",
    label,
    value,
    onChange,
    options = [],
    placeholder,
    disabled = false,
    required = false,
    error,
    helpText,
}: FormControlProps) {
    const id = label.toLowerCase().replace(/\s+/g, "-");

    const inputClass = [
        "mt-2 w-full rounded-2xl border px-4 py-3 text-sm text-slate-900 outline-none transition",
        "focus:border-slate-500 disabled:bg-slate-100 disabled:text-slate-500",
        error ? "border-red-500 bg-red-50/30" : "border-slate-300",
    ].join(" ");

    const labelNode = (
        <FieldLabel
            error={error}
            helpText={helpText}
            label={label}
            required={required}
        />
    );

    if (type === "readonly") {
        return (
            <div className="block">
                {labelNode}
                <div
                    className={[
                        "mt-2 min-h-[46px] rounded-2xl border bg-slate-50 px-4 py-3 text-sm text-slate-700",
                        error ? "border-red-500" : "border-slate-200",
                    ].join(" ")}
                    title={error}
                >
                    {String(value || "Not available")}
                </div>
            </div>
        );
    }

    if (type === "textarea") {
        return (
            <label className="block" title={error}>
                {labelNode}
                <textarea
                    aria-invalid={Boolean(error)}
                    className={inputClass}
                    disabled={disabled}
                    onChange={(event) => onChange?.(event.target.value)}
                    placeholder={placeholder}
                    rows={4}
                    value={String(value ?? "")}
                />
            </label>
        );
    }

    if (type === "select" || type === "lookup") {
        return (
            <label className="block" title={error}>
                {labelNode}
                <select
                    aria-invalid={Boolean(error)}
                    className={inputClass}
                    disabled={disabled}
                    onChange={(event) => onChange?.(event.target.value)}
                    value={String(value ?? "")}
                >
                    {placeholder ? <option value="">{placeholder}</option> : null}

                    {options.map((option) => (
                        <option key={option.value || option.label} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </label>
        );
    }

    if (type === "multiselect") {
        return (
            <label className="block" title={error}>
                {labelNode}
                <select
                    aria-invalid={Boolean(error)}
                    className={inputClass}
                    disabled={disabled}
                    multiple
                    onChange={(event) =>
                        onChange?.(
                            Array.from(event.target.selectedOptions).map(
                                (option) => option.value,
                            ),
                        )
                    }
                    value={Array.isArray(value) ? value : []}
                >
                    {options.map((option) => (
                        <option key={option.value || option.label} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </label>
        );
    }

    if (type === "checkbox" || type === "switch") {
        return (
            <label
                className={[
                    "flex min-h-[70px] items-start gap-3 rounded-2xl border bg-slate-50 px-4 py-3",
                    error ? "border-red-500" : "border-slate-200",
                ].join(" ")}
                title={error}
            >
                <input
                    checked={Boolean(value)}
                    className="mt-1 h-4 w-4"
                    disabled={disabled}
                    onChange={(event) => onChange?.(event.target.checked)}
                    type="checkbox"
                />

                <span>{labelNode}</span>
            </label>
        );
    }

    if (type === "radio") {
        return (
            <fieldset className="block" title={error}>
                {labelNode}

                <div
                    className={[
                        "mt-2 rounded-2xl border px-4 py-3",
                        error ? "border-red-500 bg-red-50/30" : "border-slate-200",
                    ].join(" ")}
                >
                    <div className="space-y-2">
                        {options.map((option) => (
                            <label
                                className="flex items-center gap-2 text-sm text-slate-700"
                                key={option.value}
                            >
                                <input
                                    checked={value === option.value}
                                    disabled={disabled}
                                    onChange={() => onChange?.(option.value)}
                                    type="radio"
                                    value={option.value}
                                />
                                {option.label}
                            </label>
                        ))}
                    </div>
                </div>
            </fieldset>
        );
    }

    const htmlType =
        type === "currency" || type === "percent" ? "number" : type;

    return (
        <label className="block" title={error}>
            {labelNode}

            <input
                aria-invalid={Boolean(error)}
                className={inputClass}
                disabled={disabled}
                id={id}
                onChange={(event) => {
                    const nextValue =
                        type === "number" || type === "currency" || type === "percent"
                            ? event.target.value === ""
                                ? ""
                                : Number(event.target.value)
                            : event.target.value;

                    onChange?.(nextValue);
                }}
                placeholder={placeholder}
                required={required}
                type={htmlType}
                value={String(value ?? "")}
            />
        </label>
    );
}