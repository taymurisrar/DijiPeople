"use client";

import type { LegalIndexEntry } from "../../lib/legal-server";
import {
  describeSlugProblem,
  type WizardForm,
  type WizardStep,
} from "../../lib/onboarding-wizard";

/**
 * The wizard's step bodies.
 *
 * Split from the container so the container is about *flow* — which step, what
 * is allowed next, what is submitted — and this file is about *fields*. Mixing
 * them is how a 500-line component nobody wants to change gets written.
 */

const inputClass =
  "mt-2 w-full rounded-xl border border-border px-3 py-2 text-foreground";
const labelClass = "block text-sm font-medium text-foreground";
const hintClass = "mt-1 text-xs text-muted";

export type StepProps = {
  form: WizardForm;
  set: (patch: Partial<WizardForm>) => void;
  missing: string[];
  tenantBaseDomain: string;
  slugState: SlugState;
  agreements: LegalIndexEntry[];
};

export type SlugState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "taken" }
  | { kind: "unknown" };

/** Marks a field the buyer must still fill, for screen readers as well as sight. */
function fieldProps(name: string, missing: string[]) {
  const invalid = missing.includes(name);
  return {
    "aria-invalid": invalid || undefined,
    "aria-describedby": invalid ? `${name}-error` : undefined,
    className: invalid
      ? `${inputClass} border-danger`
      : inputClass,
  };
}

function FieldError({ name, missing }: { name: string; missing: string[] }) {
  if (!missing.includes(name)) return null;
  return (
    <p className="mt-1 text-xs text-danger" id={`${name}-error`} role="alert">
      This is required.
    </p>
  );
}

export function OrganizationStep({ form, set, missing }: StepProps) {
  return (
    <div className="grid gap-4">
      <label className={labelClass} htmlFor="companyName">
        Company name *
        <input
          {...fieldProps("companyName", missing)}
          id="companyName"
          onChange={(event) => set({ companyName: event.target.value })}
          value={form.companyName}
        />
        <FieldError missing={missing} name="companyName" />
      </label>

      <label className={labelClass} htmlFor="legalCompanyName">
        Registered legal name
        <input
          className={inputClass}
          id="legalCompanyName"
          onChange={(event) => set({ legalCompanyName: event.target.value })}
          value={form.legalCompanyName}
        />
        <p className={hintClass}>
          Only if it differs from the name above.
        </p>
      </label>

      <label className={labelClass} htmlFor="country">
        Country *
        <input
          {...fieldProps("country", missing)}
          autoComplete="country-name"
          id="country"
          onChange={(event) => set({ country: event.target.value })}
          value={form.country}
        />
        <FieldError missing={missing} name="country" />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass} htmlFor="registrationNumber">
          Company registration number
          <input
            className={inputClass}
            id="registrationNumber"
            onChange={(event) =>
              set({ registrationNumber: event.target.value })
            }
            value={form.registrationNumber}
          />
        </label>
        <label className={labelClass} htmlFor="taxId">
          Tax / VAT number
          <input
            className={inputClass}
            id="taxId"
            onChange={(event) => set({ taxId: event.target.value })}
            value={form.taxId}
          />
        </label>
      </div>
      {/*
        Neither is required. They are jurisdiction-specific, and making them
        mandatory globally would block every buyer whose country issues no such
        number — which the brief calls out directly.
      */}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass} htmlFor="industry">
          Industry
          <input
            className={inputClass}
            id="industry"
            onChange={(event) => set({ industry: event.target.value })}
            value={form.industry}
          />
        </label>
        <label className={labelClass} htmlFor="estimatedEmployeeCount">
          Approximate employees
          <input
            className={inputClass}
            id="estimatedEmployeeCount"
            inputMode="numeric"
            min={1}
            onChange={(event) =>
              set({ estimatedEmployeeCount: event.target.value })
            }
            type="number"
            value={form.estimatedEmployeeCount}
          />
        </label>
      </div>

      <label className={labelClass} htmlFor="addressLine1">
        Registered address
        <input
          className={inputClass}
          id="addressLine1"
          onChange={(event) => set({ addressLine1: event.target.value })}
          placeholder="Street address"
          value={form.addressLine1}
        />
      </label>
      <input
        aria-label="Address line 2"
        className={inputClass}
        onChange={(event) => set({ addressLine2: event.target.value })}
        placeholder="Address line 2"
        value={form.addressLine2}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <input
          aria-label="City"
          className={inputClass}
          onChange={(event) => set({ city: event.target.value })}
          placeholder="City"
          value={form.city}
        />
        <input
          aria-label="State or province"
          className={inputClass}
          onChange={(event) => set({ stateProvince: event.target.value })}
          placeholder="State or province"
          value={form.stateProvince}
        />
      </div>

      <label className={labelClass} htmlFor="companyWebsite">
        Website
        <input
          className={inputClass}
          id="companyWebsite"
          onChange={(event) => set({ companyWebsite: event.target.value })}
          placeholder="https://"
          value={form.companyWebsite}
        />
      </label>
    </div>
  );
}

export function WorkspaceStep({
  form,
  set,
  missing,
  tenantBaseDomain,
  slugState,
}: StepProps) {
  const slug = form.requestedSlug.trim().toLowerCase();
  const formatProblem = slug ? describeSlugProblem(slug) : null;

  return (
    <div className="grid gap-4">
      <label className={labelClass} htmlFor="requestedSlug">
        Workspace address *
        <span className="mt-2 flex items-stretch rounded-xl border border-border focus-within:border-accent">
          <input
            {...fieldProps("requestedSlug", missing)}
            aria-describedby="workspace-address-state"
            autoCapitalize="none"
            autoCorrect="off"
            className="w-full rounded-l-xl border-0 px-3 py-2 text-foreground outline-none"
            id="requestedSlug"
            onChange={(event) =>
              set({ requestedSlug: event.target.value.toLowerCase() })
            }
            spellCheck={false}
            value={form.requestedSlug}
          />
          <span className="flex items-center rounded-r-xl bg-surface-muted px-3 text-sm text-muted">
            .{tenantBaseDomain}
          </span>
        </span>
      </label>

      {/*
        One live region for every outcome, so a screen reader announces the
        change rather than the sighted-only tick appearing silently.
      */}
      <p
        aria-live="polite"
        className="text-xs"
        id="workspace-address-state"
      >
        {formatProblem ? (
          <span className="text-danger">{formatProblem}</span>
        ) : slugState.kind === "checking" ? (
          <span className="text-muted">Checking availability…</span>
        ) : slugState.kind === "available" ? (
          <span className="text-success">
            {slug}.{tenantBaseDomain} is available.
          </span>
        ) : slugState.kind === "taken" ? (
          <span className="text-danger">
            {slug}.{tenantBaseDomain} is already taken. Try another.
          </span>
        ) : slugState.kind === "unknown" ? (
          /*
            The check is advisory and the server decides at submit. Saying so is
            better than a spinner that never resolves, and better than a tick
            that would be a promise we cannot keep.
          */
          <span className="text-muted">
            We could not check right now. You can continue — we will confirm
            when you submit.
          </span>
        ) : (
          <span className="text-muted">
            This is where your team will sign in. It cannot be changed later.
          </span>
        )}
      </p>
    </div>
  );
}

export function OwnerStep({ form, set, missing }: StepProps) {
  return (
    <div className="grid gap-4">
      <p className="text-sm leading-6 text-muted">
        This person becomes the workspace administrator. We send the
        verification code and the activation link to their address, so it needs
        to be one they can read now.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass} htmlFor="ownerFirstName">
          First name *
          <input
            {...fieldProps("ownerFirstName", missing)}
            autoComplete="given-name"
            id="ownerFirstName"
            onChange={(event) => set({ ownerFirstName: event.target.value })}
            value={form.ownerFirstName}
          />
          <FieldError missing={missing} name="ownerFirstName" />
        </label>
        <label className={labelClass} htmlFor="ownerLastName">
          Last name *
          <input
            {...fieldProps("ownerLastName", missing)}
            autoComplete="family-name"
            id="ownerLastName"
            onChange={(event) => set({ ownerLastName: event.target.value })}
            value={form.ownerLastName}
          />
          <FieldError missing={missing} name="ownerLastName" />
        </label>
      </div>
      {/*
        Two fields rather than one. Splitting a full name on whitespace works
        for "Ada Lovelace" and quietly mangles "Saud Al Thani", and this is the
        name on the account they will use every day.
      */}

      <label className={labelClass} htmlFor="email">
        Work email *
        <input
          {...fieldProps("email", missing)}
          autoComplete="email"
          id="email"
          onChange={(event) => set({ email: event.target.value })}
          type="email"
          value={form.email}
        />
        <FieldError missing={missing} name="email" />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass} htmlFor="phone">
          Mobile number
          <input
            autoComplete="tel"
            className={inputClass}
            id="phone"
            onChange={(event) => set({ phone: event.target.value })}
            type="tel"
            value={form.phone}
          />
        </label>
        <label className={labelClass} htmlFor="ownerJobTitle">
          Job title
          <input
            autoComplete="organization-title"
            className={inputClass}
            id="ownerJobTitle"
            onChange={(event) => set({ ownerJobTitle: event.target.value })}
            value={form.ownerJobTitle}
          />
        </label>
      </div>
    </div>
  );
}

export function AgreementsStep({ form, set, agreements }: StepProps) {
  if (!agreements.length) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-surface-muted p-4 text-sm text-muted">
        No agreements are published for your region yet, so there is nothing to
        accept here. Your subscription terms will be confirmed by our team.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm leading-6 text-muted">
        Please read and accept each of the following. We record which version
        you accepted and when.
      </p>

      {agreements.map((agreement) => {
        const id = agreement.versionId;
        if (!id) return null;
        const accepted = form.acceptedVersionIds.includes(id);

        return (
          <label
            className="flex items-start gap-3 rounded-2xl border border-border bg-white p-4 text-sm"
            key={id}
          >
            <input
              checked={accepted}
              className="mt-1 h-4 w-4"
              onChange={(event) =>
                set({
                  acceptedVersionIds: event.target.checked
                    ? [...form.acceptedVersionIds, id]
                    : form.acceptedVersionIds.filter((value) => value !== id),
                })
              }
              type="checkbox"
            />
            <span className="text-foreground">
              I accept the{" "}
              <a
                className="font-medium text-accent underline"
                href={`/legal/${agreement.slug}`}
                rel="noreferrer"
                target="_blank"
              >
                {agreement.title}
              </a>{" "}
              <span className="text-muted">(version {agreement.version})</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function ReviewStep({
  form,
  tenantBaseDomain,
  goTo,
}: StepProps & { goTo: (step: WizardStep) => void }) {
  const rows: Array<{ label: string; value: string; step: WizardStep }> = [
    { label: "Company", value: form.companyName, step: "organization" },
    { label: "Country", value: form.country, step: "organization" },
    {
      label: "Workspace",
      value: `${form.requestedSlug.trim().toLowerCase()}.${tenantBaseDomain}`,
      step: "workspace",
    },
    {
      label: "Administrator",
      value: `${form.ownerFirstName} ${form.ownerLastName}`.trim(),
      step: "owner",
    },
    { label: "Email", value: form.email, step: "owner" },
  ];

  return (
    <div className="grid gap-4">
      <p className="text-sm leading-6 text-muted">
        Check this over. Nothing has been charged yet — the next step confirms
        your email, then takes you to secure payment.
      </p>

      <dl className="divide-y divide-border rounded-2xl border border-border bg-white">
        {rows.map((row) => (
          <div
            className="flex items-baseline justify-between gap-4 px-4 py-3"
            key={row.label}
          >
            <dt className="text-sm text-muted">{row.label}</dt>
            <dd className="flex items-baseline gap-3 text-sm font-medium text-foreground">
              <span className="break-all">{row.value || "—"}</span>
              {/*
                An edit link per row rather than one "go back": the buyer who
                spots a typo in their email should not have to walk three steps
                to reach it.
              */}
              <button
                className="text-xs font-medium text-accent underline"
                onClick={() => goTo(row.step)}
                type="button"
              >
                Edit
              </button>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
