"use client";

import { useId, useRef, useState } from "react";

type PasswordFieldProps = {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  /* "new-password" on set/reset screens so managers offer to generate one. */
  autoComplete: "new-password" | "current-password";
  onBlur?: () => void;
  error?: string | null;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  /* Extra element ids (e.g. a rules list) to announce with the field. */
  describedBy?: string;
};

/*
 * One password input with a show/hide toggle, so the activation and reset
 * screens stop hand-rolling bare <input type="password"> elements.
 */
export function PasswordField({
  label,
  name,
  value,
  onChange,
  autoComplete,
  onBlur,
  error,
  disabled,
  required,
  placeholder,
  describedBy,
}: PasswordFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [visible, setVisible] = useState(false);
  const describedIds =
    [error ? errorId : null, describedBy].filter(Boolean).join(" ") ||
    undefined;

  function toggle() {
    const input = inputRef.current;
    const start = input?.selectionStart ?? null;
    const end = input?.selectionEnd ?? null;
    setVisible((current) => !current);
    /*
     * Changing `type` can drop the caret on some browsers; put focus and the
     * selection back so toggling mid-typing does not lose the user's place.
     */
    requestAnimationFrame(() => {
      if (!input) return;
      input.focus();
      if (start !== null && end !== null) input.setSelectionRange(start, end);
    });
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          aria-describedby={describedIds}
          aria-invalid={error ? true : undefined}
          autoCapitalize="none"
          autoComplete={autoComplete}
          autoCorrect="off"
          /* text-base (16px) stops iOS Safari zooming the page on focus. */
          className="w-full min-w-0 rounded-2xl border border-border bg-white/80 py-3 pl-4 pr-[4.5rem] text-base outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-70"
          disabled={disabled}
          id={id}
          name={name}
          onBlur={onBlur}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required={required}
          spellCheck={false}
          type={visible ? "text" : "password"}
          value={value}
        />
        <button
          aria-controls={id}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute right-1 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-xl px-2 text-sm font-medium text-muted transition hover:text-foreground disabled:opacity-60"
          disabled={disabled}
          onClick={toggle}
          /* type=button: a toggle must never submit the enclosing form. */
          type="button"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {error ? (
        <p className="text-sm text-red-600" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
