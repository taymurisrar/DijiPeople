"use client";

import type { LegalIndexEntry } from "../../lib/legal-server";
import { useCountryOptions } from "../../lib/use-country-options";
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
    className: invalid ? `${inputClass} border-danger` : inputClass,
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

/**
 * Industries, matching the list Platform Admin offers on a lead.
 *
 * A free-text industry produced "IT", "I.T.", "Information Technology" and
 * "Tech" as four different segments in the same report. The list ends in Other
 * deliberately: a closed list with no escape hatch pushes people into whichever
 * nearby value is least wrong, which is worse than an honest Other.
 */
/**
 * Size bands, matching the list the contact form and Platform Admin offer.
 *
 * A band rather than the exact headcount beside it: the Customers module
 * segments on this, and "47" and "50" are the same segment for every question
 * anyone asks of it.
 */
const COMPANY_SIZE_OPTIONS = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "500+",
] as const;

const INDUSTRY_OPTIONS = [
  "Healthcare",
  "IT / Software",
  "Recruitment",
  "Staffing",
  "Professional Services",
  "Real Estate",
  "Construction",
  "Education",
  "Retail",
  "Hospitality",
  "Manufacturing",
  "Financial Services",
  "Government",
  "Nonprofit",
  "Other",
] as const;

export function OrganizationStep({ form, set, missing }: StepProps) {
  const countries = useCountryOptions();
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
        <p className={hintClass}>Only if it differs from the name above.</p>
      </label>

      <label className={labelClass} htmlFor="country">
        Country *
        {/*
          A list, not a text box. "UAE", "U.A.E." and "United Arab Emirates"
          were three different customers as far as any report was concerned.

          Always a list. This previously degraded to a text input when the
          lookup could not be read, which is how the field came back looking
          untouched: an API process that has not restarted since the endpoint
          shipped answers 404, the fallback fired silently, and the buyer saw
          the same free-text box as before. `useCountryOptions` now stands the
          bundled shortlist in instead, and a successful request only widens it.

          It is not disabled while loading either. A control that is briefly
          inert is one somebody clicks and believes is broken, and the bundled
          list is already selectable on first paint.
        */}
        <select
          {...fieldProps("country", missing)}
          autoComplete="country-name"
          id="country"
          onChange={(event) => set({ country: event.target.value })}
          value={form.country}
        >
          <option value="">Select a country</option>
          {countries.countries.map((country) => (
            <option key={country.id} value={country.name}>
              {country.name}
            </option>
          ))}
          {/*
            A value already on the form that is not in the list stays
            selectable, so returning to this step never silently clears an
            answer somebody gave — and so widening the shortlist to the full
            list mid-session cannot drop a choice either.
          */}
          {form.country &&
          !countries.countries.some(
            (candidate) => candidate.name === form.country,
          ) ? (
            <option value={form.country}>{form.country}</option>
          ) : null}
        </select>
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

      {/*
        Three optional facts about the organization, asked once here rather
        than chased later. None of them gates checkout: a buyer who skips them
        is a customer with a gap in their profile, and a buyer blocked by them
        is not a customer at all.
      */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass} htmlFor="industry">
          Industry
          <select
            className={inputClass}
            id="industry"
            onChange={(event) => set({ industry: event.target.value })}
            value={form.industry}
          >
            <option value="">Select an industry</option>
            {INDUSTRY_OPTIONS.map((industry) => (
              <option key={industry} value={industry}>
                {industry}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass} htmlFor="companySize">
          Company size
          <select
            className={inputClass}
            id="companySize"
            onChange={(event) => set({ companySize: event.target.value })}
            value={form.companySize}
          >
            <option value="">Select a size</option>
            {COMPANY_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size} employees
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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
          autoComplete="address-line1"
          className={inputClass}
          id="addressLine1"
          onChange={(event) => set({ addressLine1: event.target.value })}
          placeholder="Street address"
          value={form.addressLine1}
        />
      </label>
      {/*
        Visible labels, not placeholders. A placeholder disappears the moment
        somebody types, so anyone interrupted mid-form returns to three
        identical boxes with no way to tell which one is the city. `aria-label`
        solved that for screen readers and left everybody else guessing.
      */}
      <label className={labelClass} htmlFor="addressLine2">
        Address line 2
        <input
          autoComplete="address-line2"
          className={inputClass}
          id="addressLine2"
          onChange={(event) => set({ addressLine2: event.target.value })}
          value={form.addressLine2}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass} htmlFor="city">
          City
          <input
            autoComplete="address-level2"
            className={inputClass}
            id="city"
            onChange={(event) => set({ city: event.target.value })}
            value={form.city}
          />
        </label>
        <label className={labelClass} htmlFor="stateProvince">
          State or province
          <input
            autoComplete="address-level1"
            className={inputClass}
            id="stateProvince"
            onChange={(event) => set({ stateProvince: event.target.value })}
            value={form.stateProvince}
          />
        </label>
      </div>

      <label className={labelClass} htmlFor="companyWebsite">
        Website
        {/*
          `type="url"` gives a mobile keyboard with a slash and a .com key, and
          browser validation that catches a missing scheme before the server
          does.
        */}
        <input
          autoComplete="url"
          className={inputClass}
          id="companyWebsite"
          inputMode="url"
          onChange={(event) => set({ companyWebsite: event.target.value })}
          placeholder="https://"
          type="url"
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
      <p aria-live="polite" className="text-xs" id="workspace-address-state">
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

  const acceptableIds = agreements
    .map((agreement) => agreement.versionId)
    .filter((id): id is string => Boolean(id));

  /*
   * Accepted only when every document is. There is no partial state to render:
   * `missingFieldsForStep` requires all of them, and a tick that left some out
   * would be a control that looks satisfied and does not advance.
   */
  const accepted =
    acceptableIds.length > 0 &&
    acceptableIds.every((id) => form.acceptedVersionIds.includes(id));

  return (
    <div className="grid gap-4">
      <p className="text-sm leading-6 text-muted">
        These are the terms your subscription runs on. Open any of them to read
        it — each opens in a new tab, so you won&rsquo;t lose your place.
      </p>

      {/*
        The documents as reading material, then one acceptance.

        This was ten checkboxes — one per published document — and ten
        deliberate ticks before anyone could pay. That is not a stronger
        agreement than one, it is a weaker one: past about the third box the
        clicking stops being a decision and becomes an obstacle, and the record
        it produces is ten acknowledgements nobody read rather than one somebody
        did. Every consent-UX guideline says the same thing, and every
        comparable checkout does it this way.

        Nothing is lost from the evidence. The acknowledgement record is still
        per document and per version — `acceptedVersionIds` carries all of them
        — so we can still show exactly which version of which document this
        buyer agreed to and when. What changed is how many times we ask them to
        say so.
      */}
      <ul className="grid gap-2 rounded-2xl border border-border bg-white p-4 sm:grid-cols-2">
        {agreements.map((agreement) => {
          if (!agreement.versionId) return null;
          return (
            <li key={agreement.versionId}>
              <a
                className="inline-flex items-baseline gap-1.5 text-sm text-accent underline-offset-4 hover:underline"
                href={`/legal/${agreement.slug}`}
                rel="noreferrer"
                target="_blank"
              >
                {agreement.title}
                <span className="text-xs text-muted-soft">
                  v{agreement.version}
                </span>
              </a>
            </li>
          );
        })}
      </ul>

      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-surface-muted p-4 text-sm">
        <input
          checked={accepted}
          className="mt-0.5 h-4 w-4"
          onChange={(event) =>
            set({
              acceptedVersionIds: event.target.checked ? acceptableIds : [],
            })
          }
          type="checkbox"
        />
        <span className="leading-6 text-foreground">
          I have read and agree to the{" "}
          {agreements.length === 1 ? "document" : `${agreements.length} documents`}{" "}
          listed above.
          <span className="mt-0.5 block text-xs text-muted">
            We record which version of each you accepted, and when.
          </span>
        </span>
      </label>
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
