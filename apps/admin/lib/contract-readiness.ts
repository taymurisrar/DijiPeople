/**
 * What an agreement still lacks before it can be submitted for approval, worked
 * out from the document-fields the API already returns.
 *
 * Without this the Submit action posted blindly and the operator learned about
 * a blank Effective date from a 400 — one that production monitoring then
 * recorded each time. The server stays the authority and re-checks; this only
 * stops a submission it would certainly refuse, and names every gap at once
 * instead of one per attempt.
 *
 * `signature.*` terms are exempt: they are filled from the signer's evidence
 * when signing happens, never typed in beforehand.
 */
export type ReadinessField = {
  key: string;
  label: string;
  required: boolean;
  value: string;
  problem?: string | null;
};

export function missingContractFields(fields: ReadinessField[]): string[] {
  const gaps: string[] = [];
  for (const field of fields) {
    if (field.key.toLowerCase().startsWith("signature.")) continue;
    if (field.required && !field.value?.trim()) {
      gaps.push(`${field.label} is required.`);
    } else if (field.problem) {
      gaps.push(`${field.label}: ${field.problem}`);
    }
  }
  return gaps;
}

export function contractReadinessMessage(gaps: string[]): string | null {
  if (gaps.length === 0) return null;
  return `Complete the document fields before submitting — ${gaps.join(" ")}`;
}
