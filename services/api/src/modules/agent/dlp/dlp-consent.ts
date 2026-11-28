import { LegalDocumentVersionStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';

/*
 * DP-MASTER/WP-17 (D16, S02). Content capture needs the employee's acknowledgement
 * of the CURRENT monitoring policy: the version in force now, not any version they
 * ever accepted. Publishing a new version therefore withdraws every earlier
 * acknowledgement until it is acknowledged again.
 *
 * The policy is a platform legal document (`LegalDocument`, slug below). If none
 * is published, nobody can have acknowledged it and capture stays off: the gate
 * fails closed rather than collecting without a record of consent.
 */
export const DLP_MONITORING_POLICY_SLUG = 'dlp-monitoring-policy';

export type CurrentMonitoringPolicy = {
  versionId: string;
  version: number;
  title: string;
  contentMarkdown: string;
};

export async function findCurrentMonitoringPolicy(
  prisma: PrismaService,
  now = new Date(),
): Promise<CurrentMonitoringPolicy | null> {
  const version = await prisma.legalDocumentVersion.findFirst({
    where: {
      status: LegalDocumentVersionStatus.PUBLISHED,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      document: { slug: DLP_MONITORING_POLICY_SLUG, isActive: true },
    },
    orderBy: { version: 'desc' },
    select: {
      id: true,
      version: true,
      contentMarkdown: true,
      document: { select: { title: true } },
    },
  });
  if (!version) return null;
  return {
    versionId: version.id,
    version: version.version,
    title: version.document.title,
    contentMarkdown: version.contentMarkdown,
  };
}

export async function hasCurrentMonitoringConsent(
  prisma: PrismaService,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  const policy = await findCurrentMonitoringPolicy(prisma);
  if (!policy) return false;
  const ack = await prisma.legalDocumentAcknowledgement.findFirst({
    where: { tenantId, userId, legalDocumentVersionId: policy.versionId },
    select: { id: true },
  });
  return !!ack;
}
