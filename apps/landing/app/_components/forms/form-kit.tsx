import type { ReactNode } from "react";

/**
 * One set of form parts for the public site.
 *
 * The contact form and the partner inquiry form were built independently and
 * looked it. Same site, same section of the funnel, two of everything: two
 * `Field` components, two card radii (`24px` and `28px`), two shadows, two
 * label weights (`medium` and `semibold`), two input treatments — one with a
 * focus ring and a placeholder colour, one with neither — and two opposite
 * conventions for saying which fields matter. Contact marked the optional ones
 * "(optional)"; Partners marked the required ones "*" and then explained the
 * asterisk in a footnote.
 *
 * Required is now marked with `*` on both, and there is no footnote. The
 * asterisk is a convention people already read; a line at the bottom of a form
 * explaining it is read after the form is filled in, which is too late to have
 * been useful, and it takes up the position where a submit-blocking error
 * belongs.
 *
 * The control styles here are the partner form's — they were the better set,
 * with a real focus ring and a disabled state — so the visible change lands
 * mostly on the contact form.
 */

export const formCardClass =
  "rounded-[24px] border border-border bg-white p-5 shadow-sm sm:p-6";

export const controlClass =
  "mt-1.5 h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-soft focus:border-accent focus:ring-2 focus:ring-accent/10 disabled:cursor-not-allowed disabled:bg-surface-muted";

export const textareaClass =
  "mt-1.5 min-h-[128px] w-full resize-y rounded-xl border border-border bg-white px-3 py-3 text-sm leading-6 text-foreground outline-none transition-colors placeholder:text-muted-soft focus:border-accent focus:ring-2 focus:ring-accent/10";

export const checkboxClass =
  "mt-1 h-4 w-4 shrink-0 rounded border-border accent-accent";

export const submitButtonClass =
  "w-full rounded-xl bg-accent px-5 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

/**
 * The required marker.
 *
 * Red asterisk for sighted users, the word for everyone else. `aria-hidden` on
 * the glyph alone would leave a screen reader announcing "asterisk", and
 * leaving it unhidden announces it twice on inputs that also carry `required`.
 */
function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" className="ml-0.5 text-danger">
        *
      </span>
      <span className="sr-only"> (required)</span>
    </>
  );
}

/** Label text plus its markers, shared by `Field` and `Fieldset`. */
function LabelContent({
  label,
  required,
  hint,
}: {
  label: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <span className="flex items-baseline justify-between gap-2">
      <span>
        {label}
        {required ? <RequiredMark /> : null}
      </span>
      {hint ? (
        <span className="text-xs font-normal text-muted-soft">{hint}</span>
      ) : null}
    </span>
  );
}

/**
 * One labelled control.
 *
 * The `<label>` wraps its control rather than pointing at an id. Both forms
 * previously did it both ways in the same file, and the wrapping form cannot
 * drift out of sync with an id that was renamed. Anything holding more than one
 * control needs `Fieldset` instead — a label may only describe one.
 */
export function Field({
  label,
  required = false,
  hint,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label
      className={[
        "block text-sm font-semibold text-foreground",
        className ?? "",
      ].join(" ")}
    >
      <LabelContent hint={hint} label={label} required={required} />
      {children}
    </label>
  );
}

/** A group of related controls — checkboxes, radios — with a shared legend. */
export function Fieldset({
  label,
  required = false,
  hint,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className={className}>
      <legend className="block text-sm font-semibold text-foreground">
        <LabelContent hint={hint} label={label} required={required} />
      </legend>
      {children}
    </fieldset>
  );
}

/**
 * A consent block: the notice, then the boxes.
 *
 * Kept as its own component because the rule it encodes is easy to lose —
 * acknowledging that we will use someone's details to reply is not agreement to
 * be marketed to, and the two must stay separate controls or the consent is
 * unusable as evidence.
 */
export function ConsentBox({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface-muted p-4">
      {children}
    </div>
  );
}

/** One consent checkbox and its sentence. */
export function ConsentCheckbox({
  name,
  required = false,
  checked,
  onChange,
  children,
}: {
  name: string;
  required?: boolean;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-muted">
      <input
        checked={checked}
        className={checkboxClass}
        name={name}
        onChange={(event) => onChange?.(event.target.checked)}
        required={required}
        type="checkbox"
      />
      <span>
        {required ? (
          <>
            <span aria-hidden="true" className="mr-0.5 text-danger">
              *
            </span>
            <span className="sr-only">Required. </span>
          </>
        ) : null}
        {children}
      </span>
    </label>
  );
}

/**
 * What happened when they pressed the button.
 *
 * `role="alert"` for failures and `role="status"` for everything else: an alert
 * interrupts, which is right when a submission failed and wrong when it
 * succeeded.
 */
export function FormFeedback({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: ReactNode;
}) {
  return (
    <p
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={[
        "rounded-xl px-4 py-3 text-sm",
        tone === "error"
          ? "bg-danger/5 text-danger"
          : "bg-accent-soft text-accent-strong",
      ].join(" ")}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}

export function SubmitButton({
  busy,
  busyLabel,
  children,
}: {
  busy: boolean;
  busyLabel: string;
  children: ReactNode;
}) {
  return (
    <button aria-busy={busy} className={submitButtonClass} disabled={busy} type="submit">
      {busy ? busyLabel : children}
    </button>
  );
}
