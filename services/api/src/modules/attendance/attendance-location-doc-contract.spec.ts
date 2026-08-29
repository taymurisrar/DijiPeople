import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * BUG-2091 — the canonical settings contract described attendance geolocation
 * as tenant-configurable and scoped to Remote/Hybrid, while the code threw
 * unconditionally for every mode.
 *
 * `doc-code-drift` is a named bug pattern in this repository, and the usual
 * objection to recording one is that prose cannot be tested. It can, when the
 * claim is specific: this guard pins the two halves *together*, so the doc
 * cannot drift back on its own, and the code cannot quietly become
 * configurable while the doc still says mandatory.
 *
 * Deliberately asserted as a pair. A guard over only the prose would go green
 * the day someone made location capture conditional again — which is the
 * direction the drift ran the first time.
 */

const repoRoot = join(__dirname, '..', '..', '..', '..', '..');

function read(relativePath: string) {
  /*
   * Newlines are normalised before matching. The repository is CRLF, and a
   * pattern written against \n silently matches nothing locally while matching
   * everything on a Linux CI runner — a negative assertion built that way goes
   * quiet exactly when it is supposed to fail.
   */
  return readFileSync(join(repoRoot, relativePath), 'utf8').replace(
    /\r\n/g,
    '\n',
  );
}

describe('BUG-2091 — attendance location capture is documented as the mandate it is', () => {
  const contract = read('docs/architecture/settings-and-branding.md');

  it('does not describe geolocation as scoped to Remote and Hybrid', () => {
    expect(contract).not.toMatch(/geolocation[^.\n]{0,80}Remote and Hybrid/i);
    expect(contract).not.toMatch(
      /Remote\/Hybrid browser-geolocation requirement/i,
    );
  });

  it('does not describe location capture as configurable or conditional', () => {
    expect(contract).not.toMatch(
      /(?:location|geolocation)[^.\n]{0,60}when configured/i,
    );
  });

  it('names the enforcement point, so the claim is checkable', () => {
    // Without this the doc could say "mandatory" and point at nothing.
    expect(contract).toContain('validateAttendanceLocationPayload');
  });

  it('the code still refuses unconditionally, which is what makes the doc true', () => {
    const source = read(
      'services/api/src/modules/attendance/attendance.service.ts',
    );
    const guard = /validateAttendanceLocationPayload\s*\(/;
    expect(source).toMatch(guard);

    /*
     * The defect was a mode-conditional refusal. If a check on the work mode
     * ever appears inside the validator again, the doc's "mandate" wording is
     * wrong and this fails rather than the prose quietly becoming a lie.
     */
    const start = source.search(
      /(?:private |public )?validateAttendanceLocationPayload\s*\(/,
    );
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, start + 2000);
    expect(body).not.toMatch(/workMode|WORK_MODE|isRemote|isHybrid/);
  });
});
