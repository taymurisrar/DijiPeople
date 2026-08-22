import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildWorkspaceUrl } from '@repo/config';

const service = readFileSync(
  join(__dirname, 'tenant-control-plane.service.ts'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Where a workspace is reachable — decided once, everywhere.
 *
 * This rule has now had **five** implementations. `packages/config` owns it;
 * `apps/admin/lib/tenant-url.ts` had a second (REG-179);
 * `PublicTenantsService.getTenantSlugFromHost` had a third for the reading half
 * (REG-184); and the tenant control plane had two more, both spelled
 * `` `https://${domain}` ``, which is a template literal that cannot express
 * either of the two decisions the rule exists to make.
 *
 * The symptom was `https://xoul-ltd.localhost/`: wrong protocol for a
 * development environment, and port 443 on a host that answers on 3001.
 */
describe('workspace URL', () => {
  const env = {
    PLATFORM_ENVIRONMENT: 'development',
    TENANT_BASE_DOMAIN: 'localhost',
    NEXT_PUBLIC_WEB_APP_URL: 'http://localhost:3001',
  };

  it('carries the development port the web app listens on', () => {
    /*
     * `xoul-ltd.localhost` is a real hostname — browsers loopback every
     * `.localhost` label — so this branch is taken locally, and without the
     * port it addresses 80, where nothing listens.
     */
    const url = buildWorkspaceUrl('xoul-ltd', {
      hostname: 'xoul-ltd.localhost',
      env,
    });
    expect(url).toContain(':3001');
    expect(url.startsWith('http://')).toBe(true);
  });

  it('never grafts a port onto a production hostname', () => {
    const url = buildWorkspaceUrl('maseer', {
      hostname: 'maseer.dijipeople.com',
      env: {
        PLATFORM_ENVIRONMENT: 'production',
        TENANT_BASE_DOMAIN: 'dijipeople.com',
      },
    });
    expect(url).toBe('https://maseer.dijipeople.com/');
  });

  it('is the only thing the control plane uses to answer the question', () => {
    /*
     * Asserted over source because the two defective sites were response
     * builders, not helpers — nothing called a helper, which is exactly why
     * consolidating the *callers* of the old copies missed them. What can be
     * checked is that no template literal builds one of these again.
     */
    expect(service).toContain('buildWorkspaceUrl');
    expect(service).not.toMatch(/`https:\/\/\$\{/);
    /*
     * Three sites, not two. The third was found by this assertion after the
     * first two were fixed by hand — which is the argument for asserting the
     * absence of the pattern rather than the presence of the fix.
     */
    expect((service.match(/workspaceUrlFor\(/g) ?? []).length).toBe(4);
  });

  it('returns nothing rather than a slug link when no hostname exists', () => {
    /*
     * Under a label reading "Workspace URL" beside a hostname, a
     * `…/login?workspace=x` link would claim the workspace is addressable by
     * name when it is not. The record already has an honest answer for that
     * case — the "no workspace hostname has been issued" finding.
     */
    expect(service).toContain('if (!hostname) return null;');
  });
});
