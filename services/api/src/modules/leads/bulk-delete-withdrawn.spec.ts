import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function normalized(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

const CONTROLLER = normalized(join(__dirname, 'admin-leads.controller.ts'));
const RUNTIME = normalized(
  join(__dirname, '../platform-runtime/platform-runtime.service.ts'),
);
const REGISTRY = normalized(
  join(
    __dirname,
    '../../../../../apps/admin/lib/runtime/platform-module-registry.ts',
  ),
);
const RUNTIME_TYPES = normalized(
  join(
    __dirname,
    '../../../../../apps/admin/lib/runtime/platform-runtime.types.ts',
  ),
);

function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * BUG-0018 — bulk lead delete answered 403 for every role, and the question the
 * record led with was whether it should exist at all.
 *
 * Answered on 2026-08-28: no. A lead carries commercial attribution — which
 * partner referred whom, and when — and that history outlives the lead's own
 * usefulness, because it is what a commission is calculated from and what a
 * partner dispute is settled with. Deleting one lead is a deliberate act on a
 * record somebody is looking at. Deleting a selection destroys that history for
 * an unbounded number nobody reviewed.
 *
 * The wiring defect the record describes was separately fixed before this:
 * `resolvePlatformPermission` has a `DELETE` mapping and
 * `platform-permissions.spec.ts` enumerates the controller's routes so the next
 * one cannot be dead either.
 */
describe('BUG-0018 — leads are withdrawn, not bulk deleted', () => {
  it('offers no bulk delete route', () => {
    const code = codeOnly(CONTROLLER);
    expect(code).not.toContain('bulkDelete');
    expect(code).not.toContain('BulkDeleteLeadsDto');
  });

  it('keeps single-record delete, which is a different act', () => {
    /*
     * The decision was about deleting *many*. One lead at a time, on a record
     * the operator has open, is still allowed — and converted leads were
     * already refused separately.
     *
     * It lives on the runtime's `remove` path rather than this controller: the
     * `@Delete()` removed above was the bulk one, and was the only one here.
     */
    const remove = RUNTIME.slice(
      RUNTIME.indexOf('async remove(user: AuthenticatedUser'),
    );
    expect(remove.slice(0, 400)).toContain("case 'leads':");
  });

  it('offers no bulk delete arm in the runtime either', () => {
    // The two have to agree, or the console offers an action the API refuses.
    const source = codeOnly(RUNTIME);
    const start = source.indexOf('private async bulkDelete(');
    expect(start).toBeGreaterThan(-1);
    /*
     * Bounded at the next method rather than by a character count. A fixed
     * window ran past the end of this one into a neighbour that legitimately
     * mentions leads, and the assertion failed on code it was not about.
     */
    const nextMethod = source.indexOf('\n  private async ', start + 1);
    const bulk = source.slice(
      start,
      nextMethod === -1 ? source.length : nextMethod,
    );
    expect(bulk).not.toMatch(/key === 'leads'/);
    // The neighbouring modules still have theirs, so this asserts a deliberate
    // absence rather than an empty slice.
    expect(bulk).toContain("key === 'customers'");
  });

  it('the console withholds the action rather than showing one that fails', () => {
    expect(REGISTRY).toMatch(
      /leads:\s*\{\s*create:\s*true,\s*update:\s*true,\s*delete:\s*true,\s*bulkDelete:\s*false\s*\}/,
    );
  });

  it('withholds bulk delete without withholding delete', () => {
    /*
     * `delete: false` would have been the easy way to remove the bulk action
     * and would have taken single-record delete with it — the capability gated
     * both. Separating them is what lets this record's decision be implemented
     * as it was actually made.
     */
    expect(RUNTIME_TYPES).toContain('bulkDelete?: boolean');
    expect(REGISTRY).not.toMatch(/leads:\s*\{[^}]*delete:\s*false/);
  });
});
