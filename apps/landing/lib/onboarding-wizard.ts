/**
 * The onboarding wizard's step model, extracted from the component so it can be
 * tested.
 *
 * Same reasoning as `subscribe-selection.ts`: the expensive defects in a
 * purchase flow are not rendering bugs, they are *rule* bugs — a step that
 * releases the buyer forward without a field the order needs, or one that traps
 * them behind a requirement the API never had. Neither is visible in a
 * screenshot and both are trivial to assert here.
 *
 * Nothing in this file talks to the network or decides anything the server
 * decides. Requiredness here is a **product rule about a form**; the API is
 * deliberately more permissive, because the sales-assisted path legitimately
 * knows less at the same point.
 */

export const WIZARD_STEPS = [
  "organization",
  "workspace",
  "owner",
  "agreements",
  "review",
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

/**
 * The heading shown above each step's fields.
 *
 * Kept separate from `STEP_LABELS` below because a heading and a progress label
 * are different jobs: the heading has a whole column to itself and can afford
 * "Workspace administrator", while the label sits in a five-across rail where
 * that phrase either wraps or truncates to "Worksp...".
 */
export const STEP_TITLES: Record<WizardStep, string> = {
  organization: "Your organization",
  workspace: "Your workspace",
  owner: "Workspace administrator",
  agreements: "Agreements",
  review: "Review",
};

/**
 * The one- or two-word label for the progress rail.
 *
 * The rail previously reused `STEP_TITLES`, so at ordinary widths it read
 * "Your org...", "Your wo...", "Worksp...", "Agreem...", "Review" — five
 * truncated fragments that say less than the numbers beside them. A label that
 * has to be truncated to fit is the wrong label, not a layout problem.
 */
export const STEP_LABELS: Record<WizardStep, string> = {
  organization: "Organization",
  workspace: "Workspace",
  owner: "Administrator",
  agreements: "Agreements",
  review: "Review",
};

export type WizardForm = {
  // Organization
  companyName: string;
  legalCompanyName: string;
  country: string;
  registrationNumber: string;
  taxId: string;
  industry: string;
  estimatedEmployeeCount: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateProvince: string;
  companyWebsite: string;
  // Workspace
  requestedSlug: string;
  // Owner
  ownerFirstName: string;
  ownerLastName: string;
  email: string;
  phone: string;
  ownerJobTitle: string;
  // Agreements
  acceptedVersionIds: string[];
};

export function emptyWizardForm(): WizardForm {
  return {
    companyName: "",
    legalCompanyName: "",
    country: "",
    registrationNumber: "",
    taxId: "",
    industry: "",
    estimatedEmployeeCount: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    stateProvince: "",
    companyWebsite: "",
    requestedSlug: "",
    ownerFirstName: "",
    ownerLastName: "",
    email: "",
    phone: "",
    ownerJobTitle: "",
    acceptedVersionIds: [],
  };
}

/**
 * Slug rules, mirrored from `services/api/src/common/utils/slug.util.ts`.
 *
 * A **mirror, not a source of truth** — the server validates again and its
 * answer wins. This exists so a buyer sees "cannot contain spaces" as they type
 * rather than after a round trip, and it deliberately omits the reserved-word
 * list: that list is derived from the platform's host labels, and a second copy
 * here would drift until the day somebody is told `api` is fine and the server
 * refuses it.
 */
export function describeSlugProblem(slug: string): string | null {
  if (!slug) return "Choose a workspace address.";
  if (slug.length < 3) return "Use at least 3 characters.";
  if (slug.length > 50) return "Use 50 characters or fewer.";
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return "Use lowercase letters, numbers and hyphens only.";
  }
  if (slug.startsWith("-") || slug.endsWith("-")) {
    return "Cannot start or end with a hyphen.";
  }
  if (slug.includes("--")) return "Cannot contain two hyphens in a row.";
  return null;
}

/**
 * A workspace address suggested from the company name.
 *
 * Only a prefill. The buyer can replace it, and a name that suggests nothing
 * usable — punctuation, a non-Latin script — yields an empty string rather than
 * a mangled guess they would have to notice and undo.
 */
export function suggestSlug(companyName: string): string {
  return companyName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50)
    .replace(/-$/, "");
}

/**
 * Which required fields a step is still missing.
 *
 * Returned as field names rather than a boolean so the component can mark the
 * individual inputs, and so a test naming a field failure reads as the rule it
 * is asserting.
 */
export function missingFieldsForStep(
  step: WizardStep,
  form: WizardForm,
  requiredAgreementIds: string[] = [],
): string[] {
  const blank = (value: string) => value.trim().length === 0;

  switch (step) {
    case "organization":
      return [
        ...(blank(form.companyName) ? ["companyName"] : []),
        ...(blank(form.country) ? ["country"] : []),
      ];

    case "workspace":
      // The format problem is surfaced separately so the buyer sees *why*.
      return describeSlugProblem(form.requestedSlug.trim())
        ? ["requestedSlug"]
        : [];

    case "owner":
      return [
        ...(blank(form.ownerFirstName) ? ["ownerFirstName"] : []),
        ...(blank(form.ownerLastName) ? ["ownerLastName"] : []),
        ...(blank(form.email) ? ["email"] : []),
      ];

    case "agreements":
      /*
       * Every agreement offered must be accepted. There is no "accept the
       * important ones" — a partial acceptance is not a state the acknowledgement
       * record can express, and pretending otherwise would produce evidence that
       * a buyer agreed to terms they skipped.
       */
      return requiredAgreementIds.filter(
        (id) => !form.acceptedVersionIds.includes(id),
      );

    case "review":
      return [];
  }
}

/** Whether the buyer may leave this step. */
export function canLeaveStep(
  step: WizardStep,
  form: WizardForm,
  requiredAgreementIds: string[] = [],
): boolean {
  return missingFieldsForStep(step, form, requiredAgreementIds).length === 0;
}

/**
 * The furthest step the buyer has earned.
 *
 * Used to decide which steps are clickable in the progress bar. Going *back* is
 * always allowed — a wizard that traps somebody on the step they are trying to
 * correct is worse than one that lets them wander.
 */
export function furthestReachableStep(
  form: WizardForm,
  requiredAgreementIds: string[] = [],
): WizardStep {
  let reached: WizardStep = WIZARD_STEPS[0];
  for (const step of WIZARD_STEPS) {
    if (!canLeaveStep(step, form, requiredAgreementIds)) return reached;
    reached =
      WIZARD_STEPS[
        Math.min(WIZARD_STEPS.indexOf(step) + 1, WIZARD_STEPS.length - 1)
      ];
  }
  return reached;
}

/**
 * The submit payload.
 *
 * Empty optional fields are omitted rather than sent as `""`. The API treats
 * *undefined* as "not asked" and only writes what it was given, so sending
 * empty strings would blank columns a previous submission had filled — the
 * distinction `buildOrganizationProfile` exists to preserve.
 */
export function buildSubmitPayload(
  form: WizardForm,
  selection: { planPriceId: string; seatQuantity: number },
): Record<string, unknown> {
  const text = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  const employeeCount = Number.parseInt(form.estimatedEmployeeCount, 10);

  return {
    planPriceId: selection.planPriceId,
    seatQuantity: selection.seatQuantity,
    companyName: form.companyName.trim(),
    // Still sent: the API's sales-assisted callers rely on it, and it is the
    // fallback when the two-field name is absent.
    contactName:
      `${form.ownerFirstName.trim()} ${form.ownerLastName.trim()}`.trim(),
    email: form.email.trim().toLowerCase(),
    country: form.country.trim(),
    phone: text(form.phone),
    requestedSlug: text(form.requestedSlug.toLowerCase()),
    legalCompanyName: text(form.legalCompanyName),
    registrationNumber: text(form.registrationNumber),
    taxId: text(form.taxId),
    industry: text(form.industry),
    estimatedEmployeeCount:
      Number.isFinite(employeeCount) && employeeCount > 0
        ? employeeCount
        : undefined,
    addressLine1: text(form.addressLine1),
    addressLine2: text(form.addressLine2),
    city: text(form.city),
    stateProvince: text(form.stateProvince),
    companyWebsite: text(form.companyWebsite),
    ownerFirstName: text(form.ownerFirstName),
    ownerLastName: text(form.ownerLastName),
    ownerJobTitle: text(form.ownerJobTitle),
    acceptedLegalVersionIds: form.acceptedVersionIds.length
      ? form.acceptedVersionIds
      : undefined,
  };
}
