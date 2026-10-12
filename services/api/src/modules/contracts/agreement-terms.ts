import { BadRequestException } from '@nestjs/common';

/**
 * Terms a template declares for the agreements drafted from it.
 *
 * `ContractTemplateVersion.fieldDefinitions` has existed since templates did,
 * and nothing read it. An entry whose `key` is a registered placeholder is now
 * a rule for that template only:
 *
 *   - `defaultValue` — proposed when the agreement is created and no record
 *     or operator supplies the value. It never overrides a supplied value, and
 *     the operator can change it on the agreement before sending.
 *   - `required` — the agreement cannot be sent for signature while the value
 *     is missing or invalid.
 *
 * Scoping the rules to the template is deliberate: governing law, a liability
 * floor or a pilot arrangement are mandatory in the Pakistan pilot agreement,
 * not in every partner addendum, so a global rule would block agreements this
 * hotfix must not touch. Entries in older shapes (the seed's
 * `{ key: 'signature', type: 'SIGNATURE' }`) name no registered placeholder
 * and are ignored.
 */
export type TemplateTermRule = {
  key: string;
  required: boolean;
  defaultValue?: string;
};

export function readTemplateTermRules(
  fieldDefinitions: unknown,
  isRegistered: (key: string) => boolean,
): TemplateTermRule[] {
  if (!Array.isArray(fieldDefinitions)) return [];
  return fieldDefinitions.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const key = typeof record.key === 'string' ? record.key.trim() : '';
    if (!key || !isRegistered(key)) return [];
    const defaultValue =
      typeof record.defaultValue === 'string' && record.defaultValue.trim()
        ? record.defaultValue.trim()
        : undefined;
    return [{ key, required: record.required === true, defaultValue }];
  });
}

const noticeDays = (label: string) => (value: string) =>
  /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 365
    ? null
    : `${label} must be a whole number of days between 1 and 365.`;

/*
 * Shape checks for the legal terms a template can make mandatory. They catch
 * what would print as a broken sentence — "governed by … in accordance with
 * Pakistan", "the courts located in" nothing, a liability floor with no
 * amount — not every possible drafting choice.
 */
const TERM_CHECKS: Record<string, (value: string) => string | null> = {
  'contract.governingLaw': (value) =>
    /\blaws?\b/i.test(value) && value.length >= 12
      ? null
      : 'Governing law must name the legal system, for example "the laws of the Islamic Republic of Pakistan".',
  'contract.jurisdiction': (value) =>
    value.length >= 4 && !/\bcourts?\b/i.test(value)
      ? null
      : 'Jurisdiction must name the place whose courts decide disputes, for example "Karachi, Sindh, Pakistan" (the agreement already says "the competent courts located in").',
  'contract.liabilityCap': (value) =>
    /\b[A-Z]{3}\s?\d[\d,]*(\.\d+)?\b/.test(value)
      ? null
      : 'The liability floor must state an amount with its currency, for example "PKR 100,000 (Pakistani Rupees One Hundred Thousand)".',
  'contract.terminationNoticeDays': noticeDays('Termination notice'),
  'contract.renewalNoticeDays': noticeDays('Renewal notice'),
  'commercial.pilotType': (value) =>
    value.length >= 3 ? null : 'Pilot arrangement must describe the pilot.',
};

/*
 * Terms mirrored from the agreement's own columns. A record edit re-syncs them
 * into the document, so they are changed on the agreement form; a value typed
 * into the document fields would be overwritten by the next edit.
 */
export const COLUMN_BACKED_TERMS = new Set([
  'contract.governingLaw',
  'contract.jurisdiction',
  'contract.terminationNoticeDays',
  'contract.renewalNoticeDays',
]);

function whereToEnter(key: string) {
  if (COLUMN_BACKED_TERMS.has(key))
    return 'Enter it on the agreement record (Edit agreement).';
  if (key.startsWith('platform.'))
    return 'Set it in Settings → Contracts and agreements.';
  return "Enter it in the agreement's document fields.";
}

export type AgreementTermProblem = {
  field: string;
  label: string;
  message: string;
};

/**
 * What stops an agreement from being sent: each required term the document
 * uses that is empty, and each declared term whose value fails its check.
 */
export function agreementTermProblems(
  rules: TemplateTermRule[],
  documentKeys: Set<string>,
  values: Record<string, string>,
  labelOf: (key: string) => string,
): AgreementTermProblem[] {
  const problems: AgreementTermProblem[] = [];
  for (const rule of rules) {
    if (!documentKeys.has(rule.key)) continue;
    const label = labelOf(rule.key);
    const value = (values[rule.key] ?? '').trim();
    if (!value || ['undefined', 'null'].includes(value)) {
      if (rule.required)
        problems.push({
          field: rule.key,
          label,
          message: `${label} is required. ${whereToEnter(rule.key)}`,
        });
      continue;
    }
    const failure = TERM_CHECKS[rule.key]?.(value);
    if (failure) problems.push({ field: rule.key, label, message: failure });
  }
  return problems;
}

export function assertAgreementTerms(problems: AgreementTermProblem[]) {
  if (!problems.length) return;
  throw new BadRequestException({
    code: 'CONTRACT_REQUIRED_TERMS_MISSING',
    message: `Complete these terms before sending for signature: ${problems
      .map((problem) => problem.message)
      .join(' ')}`,
    details: {
      fieldErrors: problems.map((problem) => ({
        field: problem.field,
        message: problem.message,
      })),
    },
  });
}

/** Validates a template's own declared defaults when it is saved. */
export function assertTemplateTermRules(
  rules: TemplateTermRule[],
  labelOf: (key: string) => string,
) {
  const problems = rules.flatMap((rule) => {
    if (!rule.defaultValue) return [];
    const failure = TERM_CHECKS[rule.key]?.(rule.defaultValue);
    return failure ? [`Default for ${labelOf(rule.key)}: ${failure}`] : [];
  });
  if (problems.length)
    throw new BadRequestException({
      code: 'CONTRACT_REQUIRED_TERMS_MISSING',
      message: problems.join(' '),
    });
}
