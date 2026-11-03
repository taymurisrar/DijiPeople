import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DASHBOARD_ROUTES } from './dashboard.service';

/**
 * The dashboard emits links the web app renders as buttons and rows. One of them,
 * `/documents`, named a page that does not exist, so the payroll Overview
 * prefetched a 404 on every load (found by DPQA-AUTH-030 once DP-QA-002 let that
 * role reach the dashboard at all). Every route the dashboard may emit must be
 * served by the tenant web app: a page, the settings `[category]` segment, or a
 * redirect declared in `next.config.ts`.
 */
describe('dashboard links point at real pages', () => {
  const web = resolve(process.cwd(), '..', '..', 'apps', 'web');
  const app = resolve(web, 'app', '(authenticated)');
  const nextConfig = readFileSync(resolve(web, 'next.config.ts'), 'utf8');

  function isServed(route: string) {
    const dir = route === '/' ? app : resolve(app, route.slice(1));
    if (existsSync(resolve(dir, 'page.tsx'))) return true;

    const settingsCategory = /^\/settings\/[^/]+$/.test(route);
    if (
      settingsCategory &&
      existsSync(resolve(app, 'settings', '[category]', 'page.tsx'))
    ) {
      return true;
    }

    return (
      nextConfig.includes(`"${route}"`) || nextConfig.includes(`'${route}'`)
    );
  }

  it.each([...DASHBOARD_ROUTES])('%s is served', (route) => {
    expect(isServed(route)).toBe(true);
  });
});
