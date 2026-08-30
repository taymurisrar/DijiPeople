import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * INVARIANT — a declared route must be reachable.
 *
 * Express matches routes in declaration order, and Nest registers them in the
 * order the decorators appear in the class. So a fully static route declared
 * *after* a same-verb route with a parameter that would also match it is dead:
 * every request reaches the earlier handler instead, usually with the literal
 * segment bound to the parameter.
 *
 * BUG-2461 is the case that prompted this. `@Get('me/direct-reports')` sat
 * below `@Get(':employeeId/direct-reports')`, so
 * `GET /employees/me/direct-reports` was matched with `employeeId = 'me'` and
 * answered `400 Validation failed (uuid is expected)`. Nothing called the route
 * yet, so nothing failed — the endpoint was simply unreachable, and would have
 * cost the next person who needed it an afternoon.
 *
 * The check reads controller sources rather than booting Nest, for the same
 * reason `public-write-rate-limit.invariant.spec.ts` does: booting would need
 * the whole AppModule and a database, and would only test the handlers that
 * exist rather than the rule that must hold for handlers not written yet.
 *
 * Ordering, not `@Get` vs `@Post`: a `POST` route cannot shadow a `GET` one, so
 * the verbs are compared too.
 */
describe('every declared route is reachable', () => {
  const MODULES_DIR = join(__dirname, '..', '..', 'modules');
  const API_ROOT = join(__dirname, '..', '..', '..');

  type Route = { verb: string; path: string; line: number };

  function controllerFiles(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) found.push(...controllerFiles(full));
      else if (entry.endsWith('.controller.ts')) found.push(full);
    }
    return found;
  }

  /**
   * Blank out comments, preserving offsets so reported line numbers stay true.
   *
   * Not cosmetic: this file's own fix comment quotes
   * `@Get(':employeeId/direct-reports')` to explain what went wrong, and
   * without this the scanner read that prose as a real declaration and
   * reported the very bug it documents. A codebase whose house style is
   * substantial explanatory comments will hit this constantly.
   */
  function withoutComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (comment) =>
      comment.replace(/[^\r\n]/g, ' '),
    );
  }

  function routesOf(source: string): Route[] {
    const scannable = withoutComments(source);
    const pattern =
      /@(Get|Post|Patch|Put|Delete)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g;
    const routes: Route[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(scannable))) {
      routes.push({
        verb: match[1],
        path: match[2] ?? '',
        // Counting on \n alone would be wrong on a CRLF checkout; splitting on
        // the line break itself is not, because \r stays inside the segment.
        line: scannable.slice(0, match.index).split(/\r?\n/).length,
      });
    }
    return routes;
  }

  /** Does `earlier` match every request `later` would? */
  function shadows(earlier: Route, later: Route): boolean {
    if (earlier.verb !== later.verb) return false;

    const earlierSegments = earlier.path.split('/').filter(Boolean);
    const laterSegments = later.path.split('/').filter(Boolean);
    if (earlierSegments.length !== laterSegments.length) return false;

    // Only a route with a parameter can swallow another; two static routes of
    // the same shape are a duplicate, which is a different (and louder) fault.
    if (!earlierSegments.some((segment) => segment.startsWith(':'))) {
      return false;
    }

    return earlierSegments.every(
      (segment, index) =>
        segment.startsWith(':') || segment === laterSegments[index],
    );
  }

  const findings = controllerFiles(MODULES_DIR).flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    const base = /@Controller\(\s*['"`]([^'"`]*)['"`]/.exec(source)?.[1] ?? '';
    const routes = routesOf(source);

    return routes.flatMap((later, laterIndex) => {
      const segments = later.path.split('/').filter(Boolean);
      // A route that is itself parameterised is allowed to come later; it is
      // static routes that get swallowed.
      if (!segments.length || segments.some((s) => s.startsWith(':')))
        return [];

      const shadow = routes
        .slice(0, laterIndex)
        .find((earlier) => shadows(earlier, later));
      if (!shadow) return [];

      return [
        `${relative(API_ROOT, file)}\n` +
          `      ${later.verb} '${base}/${later.path}' (line ${later.line})\n` +
          `      is unreachable — '${base}/${shadow.path}' (line ${shadow.line}) matches first`,
      ];
    });
  });

  it('finds controllers to check', () => {
    // Guards against the whole suite passing because the glob broke.
    expect(controllerFiles(MODULES_DIR).length).toBeGreaterThan(100);
  });

  it('declares no static route beneath a parameter route that shadows it', () => {
    expect(findings).toEqual([]);
  });
});
