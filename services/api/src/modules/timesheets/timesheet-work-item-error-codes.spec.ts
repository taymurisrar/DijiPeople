import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isErrorCode } from '../../common/errors/app-error';

/*
 * The work-item refusals of a timesheet save carry their own codes. The
 * HttpExceptionFilter keeps a `{ code }` only when the catalog knows it, so a
 * code missing from the catalog reaches the browser as VALIDATION_FAILED and the
 * UI has to guess from wording. Derived from the service source so a code added
 * later is caught here.
 */
const SOURCE = readFileSync(
  join(__dirname, 'timesheet-workflow.service.ts'),
  'utf8',
);

describe('timesheet work-item error codes', () => {
  const codes = [
    ...new Set(
      [...SOURCE.matchAll(/code:\s*'(TIMESHEET_WORK_ITEM_[A-Z_]+)'/g)].map(
        (m) => m[1],
      ),
    ),
  ];

  it('finds the two refusals in the service', () => {
    expect(codes.sort()).toEqual([
      'TIMESHEET_WORK_ITEM_NOT_YOURS',
      'TIMESHEET_WORK_ITEM_PROJECT',
    ]);
  });

  it.each(codes)(
    '%s is in the error catalog, so the filter keeps it',
    (code) => {
      expect(isErrorCode(code)).toBe(true);
    },
  );
});
