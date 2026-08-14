"use client";

import { useId, type ReactNode } from "react";

/**
 * "Use the inherited value" versus "Override here", made explicit.
 *
 * WHY IT EXISTS. Several settings in this product are stored as nullable
 * columns where null means "inherit". Rendered as an ordinary field, an empty
 * control is indistinguishable from a deliberate "off", and administrators
 * cannot see what they would be inheriting. This control states both: which
 * mode is active, and what the parent currently resolves to.
 *
 * Deliberately domain-free. It knows about a null-versus-value decision and
 * renders whatever editor the caller supplies, so tenant, organization and
 * location overrides can all use it.
 */
export function InheritedSettingControl({
  label,
  description,
  inheritLabel = "Use tenant setting",
  overrideLabel = "Override",
  inheritedValueLabel,
  inheritedValueCaption = "Current value",
  isOverridden,
  onModeChange,
  children,
  disabled = false,
  readOnly = false,
  readOnlyValueLabel,
}: {
  readonly label: string;
  readonly description?: string;
  readonly inheritLabel?: string;
  readonly overrideLabel?: string;
  /** What the parent scope resolves to today. */
  readonly inheritedValueLabel?: string;
  readonly inheritedValueCaption?: string;
  readonly isOverridden: boolean;
  /** `true` switches to override, `false` clears it back to inherited (null). */
  readonly onModeChange: (isOverridden: boolean) => void;
  readonly children?: ReactNode;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  /** Rendered instead of the editor when the record is being viewed. */
  readonly readOnlyValueLabel?: string;
}) {
  const groupName = useId();

  if (readOnly) {
    return (
      <div className="grid gap-1 rounded-2xl border border-border bg-white p-4">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        {description ? <p className="text-sm text-muted">{description}</p> : null}
        <p className="mt-1 text-sm text-foreground">
          {isOverridden ? (
            <>
              <span className="font-medium">
                {readOnlyValueLabel || "Overridden"}
              </span>
              <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                Override
              </span>
            </>
          ) : (
            <>
              <span className="font-medium">
                {inheritedValueLabel || "Not configured"}
              </span>
              <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                {inheritLabel}
              </span>
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <fieldset
      className="grid gap-3 rounded-2xl border border-border bg-white p-4"
      disabled={disabled}
    >
      <legend className="px-1 text-sm font-semibold text-foreground">{label}</legend>
      {description ? <p className="text-sm text-muted">{description}</p> : null}

      <div className="grid gap-2">
        <label className="flex items-start gap-2 text-sm">
          <input
            checked={!isOverridden}
            className="mt-1"
            name={groupName}
            onChange={() => onModeChange(false)}
            type="radio"
          />
          <span>
            <span className="font-medium text-foreground">{inheritLabel}</span>
            {inheritedValueLabel ? (
              <span className="block text-sm text-muted">
                {inheritedValueCaption}: {inheritedValueLabel}
              </span>
            ) : null}
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input
            checked={isOverridden}
            className="mt-1"
            name={groupName}
            onChange={() => onModeChange(true)}
            type="radio"
          />
          <span className="font-medium text-foreground">{overrideLabel}</span>
        </label>
      </div>

      {isOverridden && children ? (
        <div className="border-t border-border pt-3">{children}</div>
      ) : null}
    </fieldset>
  );
}

/**
 * The radio group an overridden value itself is chosen with.
 *
 * Separate from the control above so the two decisions stay visually distinct:
 * first whether to override, then what to override it to.
 */
export function InheritedOptionChoices({
  name,
  onChange,
  options,
  value,
}: {
  readonly name?: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly { readonly value: string; readonly label: string; readonly description?: string }[];
  readonly value: string;
}) {
  const groupName = useId();

  return (
    <div className="grid gap-2">
      {options.map((option) => (
        <label className="flex items-start gap-2 text-sm" key={option.value}>
          <input
            checked={value === option.value}
            className="mt-1"
            name={name ?? groupName}
            onChange={() => onChange(option.value)}
            type="radio"
            value={option.value}
          />
          <span>
            <span className="font-medium text-foreground">{option.label}</span>
            {option.description ? (
              <span className="block text-sm text-muted">{option.description}</span>
            ) : null}
          </span>
        </label>
      ))}
    </div>
  );
}
