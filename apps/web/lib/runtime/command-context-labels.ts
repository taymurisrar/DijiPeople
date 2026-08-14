/**
 * Labels for the context line a command surface shows above its form.
 *
 * WHY IT IS ITS OWN MODULE. The check-in drawer rendered
 * `Shift: {resolvedShift.name}` unconditionally, which produced "Shift: Karachi
 * Office" for a tenant whose shift template is named after a place. The value
 * was correct — `resolvedShift` is always a ShiftTemplate, and no work-site name
 * can reach that field — but nothing stopped a future change from routing a
 * different record into the same line, and nothing asserted which label belongs
 * to which record. Extracted here so that invariant is testable in this app's
 * node-only test runner.
 */

export type CommandContextSource = {
  readonly shiftName?: string | null;
  readonly workSiteName?: string | null;
};

/**
 * A shift is only ever called a shift, and a work site only ever a work site.
 *
 * Shift wins when both are known: it is the more specific statement about the
 * hours the employee is being measured against, which is what the line is for.
 */
export function commandContextSubtitle(source: CommandContextSource): string {
  const shift = source.shiftName?.trim();
  if (shift) return `Shift: ${shift}`;

  const workSite = source.workSiteName?.trim();
  if (workSite) return `Work Site: ${workSite}`;

  return "";
}
