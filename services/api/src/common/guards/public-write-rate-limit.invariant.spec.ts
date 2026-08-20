import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

/**
 * INVARIANT — every unauthenticated write is rate limited.
 *
 * This is ITEM-0013, built because the failure it predicted has now happened
 * three times:
 *
 *   BUG-0013  /public/leads      had no rate limit
 *   BUG-0031  /public/subscribe  had no rate limit
 *   BUG-0033  /agent/auth/login  had no rate limit
 *
 * Each was fixed by hand, on one controller, and the next public write added
 * afterwards arrived without a guard. The shared root cause is not any of the
 * three endpoints — it is that nothing failed when a `@Public()` write was
 * added without protection. A convention that has been broken three times is
 * not a convention; it is an unenforced intention.
 *
 * The check reads controller sources rather than booting Nest. Booting would
 * need the whole AppModule and a database, and would test the wiring of the
 * handlers that exist rather than the rule that must hold for handlers not
 * written yet.
 */
describe('every public write handler is rate limited', () => {
  const MODULES_DIR = join(__dirname, '..', '..', 'modules');

  /**
   * Controllers exempt from the guard, each with the reason it is safe.
   *
   * An allowlist rather than a silent skip: adding an entry is a deliberate act
   * that shows up in review, which is the whole point of the invariant.
   */
  const ALLOWLIST = new Map<string, string>([
    [
      'stripe-webhook.controller.ts',
      'Authenticated by Stripe signature verification, not by session. ' +
        'Throttling it would drop legitimate provider retries and cause missed ' +
        'subscription events — the signature check is the correct control.',
    ],
    [
      'release-publisher.controller.ts',
      'Guarded by a bearer release token (RELEASE_PUBLISH_TOKEN); not an ' +
        'anonymous surface.',
    ],
  ]);

  const WRITE_DECORATOR = /@(Post|Put|Patch|Delete)\s*\(/;
  const HANDLER_SIGNATURE = /^ {2}(async\s+)?[a-zA-Z]\w*\s*\(/;
  const GUARD = 'PublicRateLimitGuard';

  function collectControllers(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      if (statSync(fullPath).isDirectory()) {
        found.push(...collectControllers(fullPath));
      } else if (entry.endsWith('.controller.ts')) {
        found.push(fullPath);
      }
    }
    return found;
  }

  /**
   * Whether the guard is applied to the class itself rather than a handler.
   *
   * Controller-level is the safe form, because it covers handlers added later.
   * Per-handler application is precisely how BUG-0031 happened: the guard was
   * put on one handler of `PublicBillingController` and the `subscribe` handler
   * added beside it inherited nothing.
   */
  /*
   * Only the contiguous decorator block immediately above `@Controller(` counts.
   *
   * This used to test `source.slice(0, controllerIndex).includes(GUARD)` — every
   * character before the class decorator, which spans the import block. A file
   * cannot apply a decorator it has not imported, so the import line alone
   * satisfied the predicate, and every controller that could possibly be guarded
   * was reported as guarded. `PublicBillingController` imported the guard, used
   * it on one GET handler, left `@Post('subscribe')` bare, and this suite stayed
   * green (BUG-0075) — reproducing BUG-0031 on the very handler the comment above
   * names as the reason the check exists.
   */
  function hasControllerLevelGuard(source: string) {
    const lines = source.split(/\r?\n/);
    const controllerIndex = lines.findIndex((line) =>
      /@Controller\s*\(/.test(line),
    );
    if (controllerIndex < 0) return false;

    let start = controllerIndex;
    while (start > 0 && lines[start - 1].trim().startsWith('@')) start -= 1;

    return lines
      .slice(start, controllerIndex)
      .some((line) => line.includes(GUARD));
  }

  /**
   * The public write handlers that are not individually guarded.
   *
   * Each `@Public()` is resolved to the handler it actually decorates — the
   * next method signature below it — and then judged on that handler's own
   * contiguous decorator block. A fixed line window is not good enough: it
   * reaches past the signature into the *following* handler's decorators and
   * reports public GET handlers as unguarded writes because a `@Post()` happens
   * to sit a few lines below them.
   */
  function unguardedPublicWrites(source: string) {
    const lines = source.split(/\r?\n/);
    const offenders: string[] = [];

    lines.forEach((line, index) => {
      if (!line.includes('@Public()')) return;

      const signatureIndex = lines.findIndex(
        (candidate, at) => at >= index && HANDLER_SIGNATURE.test(candidate),
      );
      if (signatureIndex < 0) return;

      // Walk back up from the signature to the top of its decorator block.
      let start = signatureIndex;
      while (start > 0 && lines[start - 1].trim().startsWith('@')) start -= 1;

      const decorators = lines.slice(start, signatureIndex).join('\n');
      if (!WRITE_DECORATOR.test(decorators)) return;
      if (decorators.includes(GUARD)) return;

      offenders.push(lines[signatureIndex].trim());
    });

    return offenders;
  }

  const controllers = collectControllers(MODULES_DIR).map((filePath) => ({
    path: filePath,
    name: basename(filePath),
    source: readFileSync(filePath, 'utf8'),
  }));

  it('finds controllers to check', () => {
    // Guards against the check silently passing because the walk found nothing.
    expect(controllers.length).toBeGreaterThan(20);
  });

  const publicWriteControllers = controllers.filter(
    (controller) =>
      controller.source.includes('@Public()') &&
      WRITE_DECORATOR.test(controller.source),
  );

  it('finds public write controllers to check', () => {
    expect(publicWriteControllers.length).toBeGreaterThan(0);
  });

  it.each(publicWriteControllers.map((c) => [c.name, c]))(
    '%s rate limits every public write',
    (_name, controller) => {
      const { name, source } = controller;

      if (ALLOWLIST.has(name)) {
        // Named exemption. The reason is the assertion — an entry with an empty
        // reason is not an exemption, it is an unexplained hole.
        expect(ALLOWLIST.get(name)?.length ?? 0).toBeGreaterThan(40);
        return;
      }

      if (hasControllerLevelGuard(source)) return;

      // Not class-guarded, so every public write must carry its own.
      expect(unguardedPublicWrites(source)).toEqual([]);
    },
  );

  it('does not allowlist a controller that no longer exists', () => {
    // A stale exemption silently protects nothing while looking deliberate.
    const names = new Set(controllers.map((controller) => controller.name));
    for (const allowlisted of ALLOWLIST.keys()) {
      expect(names.has(allowlisted)).toBe(true);
    }
  });
});
