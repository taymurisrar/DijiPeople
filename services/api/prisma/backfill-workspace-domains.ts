/**
 * Give every existing tenant a usable workspace address.
 *
 * WHY THIS IS A COMMAND AND NOT A MIGRATION. A slug has to be normalised,
 * checked against the reserved list and checked for global uniqueness before it
 * can be persisted, and a collision needs a human decision. A migration that
 * appended a random suffix to resolve one would silently hand a customer an
 * address nobody chose and nobody knows — so this reports unresolved rows and
 * changes nothing for them instead.
 *
 * Idempotent and safe to re-run. Defaults to a dry run.
 *
 *   npm --workspace api run backfill:workspace-domains          # report only
 *   npm --workspace api run backfill:workspace-domains -- --apply
 */
import 'dotenv/config';
import {
  PrismaClient,
  TenantDomainTlsStatus,
  TenantDomainType,
  TenantDomainVerificationStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  buildWorkspaceHostname,
  getPlatformDomainConfig,
  isReservedHostLabel,
  isValidWorkspaceSlugFormat,
  suggestWorkspaceSlug,
} from '@repo/config';

type Outcome = {
  tenantId: string;
  name: string;
  slug: string | null;
  action: 'OK' | 'SLUG_SET' | 'DOMAIN_CREATED' | 'PRIMARY_SET' | 'UNRESOLVED';
  detail: string;
};

async function main() {
  const apply = process.argv.includes('--apply');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  const config = getPlatformDomainConfig();
  const outcomes: Outcome[] = [];

  console.log(
    `Workspace backfill (${apply ? 'APPLY' : 'DRY RUN'}) — tenant base domain: ${
      config.tenantBaseDomain || '(not configured; hostnames will be skipped)'
    }`,
  );

  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      name: true,
      displayName: true,
      slug: true,
      tenantCode: true,
      tenantDomains: {
        select: { id: true, domain: true, isPrimary: true, type: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  /* Every slug in play, so a proposal cannot collide with one assigned above. */
  const takenSlugs = new Set(tenants.map((tenant) => tenant.slug).filter(Boolean));

  for (const tenant of tenants) {
    const label = tenant.displayName || tenant.name;

    let slug = tenant.slug;
    if (!slug || !isValidWorkspaceSlugFormat(slug) || isReservedHostLabel(slug)) {
      /*
       * Derive from the tenant code first — it is already unique and stable —
       * then from the name. Never invent a suffix.
       */
      const candidates = [
        tenant.tenantCode ? suggestWorkspaceSlug(tenant.tenantCode) : '',
        suggestWorkspaceSlug(label),
      ].filter(
        (candidate) =>
          candidate &&
          isValidWorkspaceSlugFormat(candidate) &&
          !isReservedHostLabel(candidate) &&
          !takenSlugs.has(candidate),
      );

      const proposed = candidates[0];
      if (!proposed) {
        outcomes.push({
          tenantId: tenant.id,
          name: label,
          slug: tenant.slug,
          action: 'UNRESOLVED',
          detail:
            'No safe slug could be derived (empty, reserved, or already taken). Assign one manually in Platform Admin.',
        });
        continue;
      }

      if (apply) {
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: { slug: proposed },
        });
      }
      takenSlugs.add(proposed);
      slug = proposed;
      outcomes.push({
        tenantId: tenant.id,
        name: label,
        slug: proposed,
        action: 'SLUG_SET',
        detail: `Workspace slug set to "${proposed}".`,
      });
    }

    if (!config.tenantBaseDomain) {
      /*
       * Reported rather than skipped silently. "Nothing happened" and "no base
       * domain is configured so no hostname could be issued" are different
       * facts, and only the second tells the operator what to do next.
       */
      outcomes.push({
        tenantId: tenant.id,
        name: label,
        slug,
        action: 'UNRESOLVED',
        detail:
          'No tenant base domain is configured for this environment, so no workspace hostname can be issued. Set TENANT_BASE_DOMAIN and re-run.',
      });
      continue;
    }

    const hostname = buildWorkspaceHostname(slug!);
    const existing = tenant.tenantDomains.find((domain) => domain.domain === hostname);
    const primary = tenant.tenantDomains.find((domain) => domain.isPrimary);

    if (!existing) {
      const claimedByAnother = await prisma.tenantDomain.findUnique({
        where: { domain: hostname },
        select: { tenantId: true },
      });
      if (claimedByAnother && claimedByAnother.tenantId !== tenant.id) {
        outcomes.push({
          tenantId: tenant.id,
          name: label,
          slug,
          action: 'UNRESOLVED',
          detail: `${hostname} is already assigned to another tenant. Resolve the conflict manually.`,
        });
        continue;
      }

      if (apply) {
        await prisma.$transaction(async (tx) => {
          if (!primary) {
            /* Nothing else is primary, so this becomes it. */
          } else {
            await tx.tenantDomain.updateMany({
              where: { tenantId: tenant.id, isPrimary: true },
              data: { isPrimary: false },
            });
          }
          await tx.tenantDomain.create({
            data: {
              tenantId: tenant.id,
              domain: hostname,
              type: TenantDomainType.SYSTEM_SUBDOMAIN,
              isPrimary: true,
              /*
               * PENDING, not VERIFIED. Whether it resolves depends on the
               * platform wildcard being configured, which this command does not
               * check and must not assert.
               */
              verificationStatus: TenantDomainVerificationStatus.PENDING,
              tlsStatus: TenantDomainTlsStatus.PENDING,
            },
          });
        });
      }
      outcomes.push({
        tenantId: tenant.id,
        name: label,
        slug,
        action: 'DOMAIN_CREATED',
        detail: `System hostname ${hostname} created as primary (pending platform wildcard confirmation).`,
      });
      continue;
    }

    if (!primary) {
      if (apply) {
        await prisma.tenantDomain.update({
          where: { id: existing.id },
          data: { isPrimary: true },
        });
      }
      outcomes.push({
        tenantId: tenant.id,
        name: label,
        slug,
        action: 'PRIMARY_SET',
        detail: `${hostname} marked primary.`,
      });
      continue;
    }

    outcomes.push({
      tenantId: tenant.id,
      name: label,
      slug,
      action: 'OK',
      detail: `${primary.domain} is already primary.`,
    });
  }

  const byAction = outcomes.reduce<Record<string, number>>((counts, item) => {
    counts[item.action] = (counts[item.action] ?? 0) + 1;
    return counts;
  }, {});

  console.log('\nResults');
  for (const outcome of outcomes) {
    console.log(
      `  [${outcome.action.padEnd(15)}] ${outcome.name} — ${outcome.detail}`,
    );
  }
  console.log('\nSummary:', JSON.stringify(byAction));

  const unresolved = outcomes.filter((item) => item.action === 'UNRESOLVED');
  if (unresolved.length) {
    console.log(
      `\n${unresolved.length} tenant(s) need a manual decision. Nothing was changed for them.`,
    );
  }
  if (!apply) {
    console.log('\nDry run. Re-run with --apply to persist these changes.');
  }

  await prisma.$disconnect();
  /* Unresolved rows are a report, not a crash — the command did its job. */
}

void main().catch((error: unknown) => {
  console.error(
    'Workspace backfill failed:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
