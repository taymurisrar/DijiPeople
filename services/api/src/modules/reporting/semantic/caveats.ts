/**
 * Caveats that more than one source or metric needs to say.
 *
 * Every caveat here was previously written twice — once on the data source and
 * once on each metric that shares it — in wording that differed by a few words.
 * That is not harmless duplication. `AnalyticsService.collectCaveats` unions the
 * source's caveats with those of every metric on the surface and deduplicates
 * the result with a `Set`, and a `Set` deduplicates by exact string. Two correct
 * sentences saying one thing both survive, so the "How to read these numbers"
 * panel listed the same note twice on every analytics surface — five times over
 * on Desktop Activity.
 *
 * Both placements are still needed and neither is redundant: the metric's copy
 * is what puts the note beside the tile carrying the number, and the source's
 * copy is what puts it in the page panel. What has to be true is that they are
 * the *same string*, so the union folds them into one.
 *
 * `caveat-uniqueness.spec.ts` fails when a new caveat is restated rather than
 * imported, comparing word-set overlap rather than a prefix — the pair that
 * shipped diverged at the fourth word.
 */

/** Attendance is dated by the shift, which is not the calendar day. */
export const SHIFT_DAY_CAVEAT =
  'The date is the SHIFT day, not the calendar day. An overnight shift produces one row dated to the shift start, with punches on either side of midnight.';

/**
 * Organisational dimensions come from the employee record, which holds only
 * today's placement. True of every source that joins through `employee`.
 */
export const CURRENT_PLACEMENT_CAVEAT =
  'Organisational dimensions are read through the employee, so they reflect the employee’s CURRENT department, team and location rather than where they sat on the date of the row.';

/** Leave consumption rows are dated by when they were written, not by the leave. */
export const LEAVE_CONSUMPTION_PERIOD_CAVEAT =
  'A period narrows this source on when the consumption row was WRITTEN, not on the leave dates. Filter on "Leave start date" to report by when the leave was taken.';

/** Leave requests are dated by the leave, not by when someone asked. */
export const LEAVE_REQUEST_PERIOD_CAVEAT =
  'A period selects requests by their leave START date, not by when they were raised. Filter on "Requested at" to report by when the request was made.';

/** An opening is a requisition, not a headcount. */
export const REQUISITION_COUNT_CAVEAT =
  'There is no headcount or vacancy-count column on an opening, so one opening is one requisition regardless of how many people it is meant to hire.';
