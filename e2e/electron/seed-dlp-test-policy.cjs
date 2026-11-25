#!/usr/bin/env node
/*
 * Prepares a THROWAWAY database for e2e/electron/agent-dlp-privacy.cjs: turns on
 * clipboard/screenshot capture for one test tenant, adds a rule, and publishes a
 * long TEST copy of the monitoring policy ending in END-OF-POLICY-MARKER.
 *
 * It refuses any database whose name does not contain "_gui" or "_e2e", and it
 * never reads docs/programs/.../dlp-monitoring-policy-draft.md into production:
 * the real policy stays an unpublished draft.
 *
 *   E2E_DATABASE_URL   postgresql://…/dp_master_gui   (required)
 *   E2E_TENANT_SLUG    the test tenant's slug          (default dijipeople-demo)
 *   E2E_REPO_ROOT      repo root, for @prisma/client   (default process.cwd())
 */
const path = require('node:path');

const url = process.env.E2E_DATABASE_URL;
if (!url || !/\/[^/?]*(_gui|_e2e)[^/?]*(\?|$)/.test(url)) {
  console.error('FAIL: E2E_DATABASE_URL must name a throwaway database (…_gui or …_e2e).');
  process.exit(2);
}
const root = process.env.E2E_REPO_ROOT || process.cwd();
const { PrismaClient } = require(path.join(root, 'node_modules/@prisma/client'));
const { PrismaPg } = require(path.join(root, 'node_modules/@prisma/adapter-pg'));
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

(async () => {
  const slug = process.env.E2E_TENANT_SLUG || 'dijipeople-demo';
  const tenant = await prisma.tenant.findFirstOrThrow({ where: { slug }, select: { id: true } });
  const paragraph =
    'This is a TEST copy of a monitoring policy used only to drive the desktop agent in a browser-less end-to-end run. ';
  const long = paragraph.repeat(60) + '\n\nEND-OF-POLICY-MARKER';
  await prisma.agentTrackingSettings.upsert({
    where: { tenantId: tenant.id },
    update: { allowClipboardCapture: true, allowScreenshotCapture: true, dlpConsentRequired: true },
    create: { tenantId: tenant.id, allowClipboardCapture: true, allowScreenshotCapture: true, dlpConsentRequired: true },
  });
  if (!(await prisma.dlpRule.count({ where: { tenantId: tenant.id } }))) {
    await prisma.dlpRule.create({
      data: { tenantId: tenant.id, name: 'e2e-rule', enabled: true, sourceAppPatterns: ['excel'], channelAppPatterns: ['whatsapp'] },
    });
  }
  let doc = await prisma.legalDocument.findUnique({ where: { slug: 'dlp-monitoring-policy' } });
  if (!doc) {
    doc = await prisma.legalDocument.create({
      data: { type: 'SECURITY_NOTICE', slug: 'dlp-monitoring-policy', title: 'Monitoring policy (E2E TEST COPY)' },
    });
  }
  if (!(await prisma.legalDocumentVersion.count({ where: { legalDocumentId: doc.id } }))) {
    await prisma.legalDocumentVersion.create({
      data: {
        legalDocumentId: doc.id,
        version: 1,
        status: 'PUBLISHED',
        contentMarkdown: long,
        effectiveFrom: new Date(Date.now() - 86_400_000),
        publishedAt: new Date(),
      },
    });
  }
  console.log('seeded test policy; chars', long.length, '; end marker END-OF-POLICY-MARKER');
  await prisma.$disconnect();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
