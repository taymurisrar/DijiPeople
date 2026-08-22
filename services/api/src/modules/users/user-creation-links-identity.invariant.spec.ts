import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every path that creates a `User` must give it an `Identity`, and they must all
 * do it the same way.
 *
 * `User.identityId` is **nullable** through the expand phase, and that is what
 * makes this worth a build failure rather than a code-review habit. A call site
 * that forgets produces a working user, a passing test suite and a green
 * deploy — and the row is invisible until WP-09 tries to make the column
 * required and finds accounts it cannot fill. By then the offending code has
 * shipped, and the fix is a data repair rather than a one-line change.
 *
 * It is the same shape as the defect this repository already names
 * `declared-but-unwired-step`: the structure exists, and one of the paths into
 * it quietly does not use it.
 *
 * **Scoped to creation, not to every mention of `user.create`.** A test double,
 * a mock, or a comment naming it are not call sites. The scan therefore reads
 * `src/` and `prisma/` — the code that actually runs — and skips specs.
 */

const API_ROOT = join(__dirname, '..', '..', '..');

/** Directories whose `user.create(...)` calls really do create users. */
const SCANNED = [join(API_ROOT, 'src'), join(API_ROOT, 'prisma')];

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'migrations')
        continue;
      found.push(...sourceFiles(path));
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    // Specs mock Prisma; a mocked create is not a call site.
    if (entry.name.includes('.spec.') || entry.name.includes('.e2e-spec.')) {
      continue;
    }
    found.push(path);
  }
  return found;
}

/**
 * The `data: { … }` object of a `user.create(` call, by brace matching.
 *
 * A regex over the whole file would match the wrong `identityId` — the one in
 * the neighbouring `userRole.create` or three functions further down. Reading
 * to the matching brace is the difference between "this call links an identity"
 * and "this file mentions identities somewhere".
 */
function callBlocks(source: string, pattern: RegExp): string[] {
  const blocks: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    let depth = 0;
    let index = match.index + match[0].length - 1;
    const start = index;
    for (; index < source.length; index += 1) {
      const char = source[index];
      if (char === '(') depth += 1;
      else if (char === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    blocks.push(source.slice(start, index + 1));
  }
  return blocks;
}

function userCreateBlocks(source: string): string[] {
  return callBlocks(source, /\buser\.create\s*\(/g);
}

/** The same, for `user.update(` — see the password-mirror block below. */
function userUpdateBlocks(source: string): string[] {
  return callBlocks(source, /\buser\.update\s*\(/g);
}

describe('every user-creation path links an Identity', () => {
  const callSites = SCANNED.flatMap((dir) =>
    sourceFiles(dir).flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      return userCreateBlocks(source).map((block, index) => ({
        path: path.slice(API_ROOT.length + 1).replace(/\\/g, '/'),
        index,
        block,
      }));
    }),
  );

  /*
   * A guard that finds nothing to guard is inert, not passing. If a refactor
   * renames the call or moves these files, this fails loudly instead of going
   * green forever — the failure mode BUG-0081 was filed for.
   */
  it('finds the call sites it is supposed to be checking', () => {
    expect(callSites.length).toBeGreaterThanOrEqual(4);
  });

  it.each(
    callSites.map(
      (site) => [`${site.path} #${site.index}`, site.block] as const,
    ),
  )('%s sets identityId', (_label, block) => {
    expect(block).toMatch(/\bidentityId\b/);
  });

  it('keeps every caller on the one implementation', () => {
    /*
     * There is exactly one `ensureIdentityForEmail`, and this asserts nobody has
     * quietly grown a second.
     *
     * The first version of this work put the rule in an `@Injectable()` that
     * `UsersRepository` took in its constructor, which broke every module
     * providing `UsersRepository` on its own — `TenantsModule` does — and left
     * the seed scripts, which run outside the Nest container, needing a copy.
     * A plain function over a db client needs no wiring and lets the seed call
     * the same code the API does. Re-introducing a copy is the regression this
     * guards.
     */
    const callers = SCANNED.flatMap(sourceFiles).filter((path) => {
      const source = readFileSync(path, 'utf8');
      return (
        source.includes('ensureIdentityForEmail(') &&
        !path.endsWith('identity.service.ts')
      );
    });

    // The repository, both provisioning services, and the demo seed.
    expect(callers.length).toBeGreaterThanOrEqual(4);

    for (const path of callers) {
      const source = readFileSync(path, 'utf8');
      const label = path.slice(API_ROOT.length + 1).replace(/\\/g, '/');

      // Imported, never redefined.
      expect({
        label,
        imports: /import \{[^}]*ensureIdentityForEmail/s.test(source),
      }).toEqual({ label, imports: true });
      expect({
        label,
        redefines: /function ensureIdentityForEmail/.test(source),
      }).toEqual({ label, redefines: false });
    }

    /*
     * And no caller may write over an identity's credential. Once the auth
     * split lands, an identity's password changes independently of any `User`
     * row, so a provisioning path that pushed its placeholder into
     * `identity.update` would lock somebody out of a workspace they already
     * had.
     */
    for (const path of callers) {
      const source = readFileSync(path, 'utf8');
      const label = path.slice(API_ROOT.length + 1).replace(/\\/g, '/');
      expect({ label, updates: /identity\.update\(/.test(source) }).toEqual({
        label,
        updates: false,
      });
    }
  });
});

/**
 * Every path that sets a password must set it on the identity too.
 *
 * This is the mirror image of the creation rule, and the more dangerous of the
 * two. `User.passwordHash` and `Identity.passwordHash` both exist through the
 * expand phase, and login still reads the `User` copy — so a path that writes
 * only `User` looks completely correct today and becomes a defect the moment
 * the read moves. Two shapes, both bad:
 *
 *   a password *change* that reaches only `User` locks somebody out with the
 *   password they just chose and watched be accepted;
 *
 *   a credential *rotation* that reaches only `User` rotates nothing — the old
 *   password keeps working, and the operator has been told it was revoked.
 *
 * The second is worse, because nobody finds out.
 */
describe('every password write reaches the Identity', () => {
  const writers = SCANNED.flatMap((dir) => sourceFiles(dir)).filter((path) => {
    const source = readFileSync(path, 'utf8');
    // A `user.update(...)` whose data object actually sets a password.
    return userUpdateBlocks(source).some((block) =>
      /passwordHash\s*[,:]/.test(block),
    );
  });

  /*
   * Inert-guard check, as above. At the time of writing: the reset-password
   * path in `auth.service.ts`, two platform-admin resets in
   * `super-admin.service.ts`, and the service-account rotation in
   * `tenant-access.service.ts`.
   */
  it('finds the password writers it is supposed to be checking', () => {
    expect(writers.length).toBeGreaterThanOrEqual(3);
  });

  it.each(
    writers.map(
      (path) =>
        [path.slice(API_ROOT.length + 1).replace(/\\/g, '/'), path] as const,
    ),
  )('%s mirrors the password to the identity', (_label, path) => {
    const source = readFileSync(path, 'utf8');

    /*
     * `mirrorPasswordToIdentity(` with the paren, not merely the name.
     *
     * The first version of this assertion used `toContain('mirrorPasswordTo-
     * Identity')`, and a mutation that deleted the *call* while leaving the
     * *import* passed it — the import line mentions the name. That is the
     * `assertion-without-a-check` shape, caught here by mutation-testing the
     * check rather than by trusting it went green.
     */
    expect(source).toMatch(/mirrorPasswordToIdentity\s*\(/);
  });

  it('routes every mirror through the one function', () => {
    /*
     * `mirrorPasswordToIdentity` is the only place allowed to write
     * `identity.passwordHash` after creation, which is what keeps "reset this
     * person's password" and "quietly overwrite a credential they are using"
     * from being the same line of code. Any other file writing it directly is
     * the regression.
     */
    const offenders = SCANNED.flatMap((dir) => sourceFiles(dir)).filter(
      (path) =>
        !path.endsWith('identity.service.ts') &&
        /identity\.update\(/.test(readFileSync(path, 'utf8')),
    );

    expect(offenders.map((p) => p.slice(API_ROOT.length + 1))).toEqual([]);
  });
});
