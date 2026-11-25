import { ConflictException } from '@nestjs/common';
import { AgentService } from './agent.service';

/*
 * DP-MASTER/WP-17: the agent is told capture is OFF until the employee has
 * acknowledged the CURRENT policy, so nothing is sampled, buffered or sent.
 */
function build(options: {
  consentRequired?: boolean;
  policy?: boolean;
  acknowledged?: boolean;
}) {
  const settings = {
    tenantId: 't1',
    enabled: true,
    captureActiveApp: true,
    captureWindowTitle: false,
    allowClipboardCapture: true,
    allowScreenshotCapture: true,
    clipboardFullContent: false,
    dlpConsentRequired: options.consentRequired ?? true,
    screenshotRetentionDays: 30,
    historyRetentionDays: 90,
    heartbeatIntervalSeconds: 60,
    idleThresholdSeconds: 120,
    awayThresholdSeconds: 600,
    heartbeatBatchSize: 10,
    offlineQueueEnabled: true,
    minimumSupportedVersion: '1.0.0',
    latestVersion: '1.0.0',
    forceUpdate: false,
    updateMessage: null,
    autoUpdateEnabled: true,
    mandatory: false,
    installerUrl: null,
    releaseDate: null,
    allowCameraAccess: false,
    allowMicrophoneAccess: false,
    allowLocationAccess: false,
  };
  const prisma = {
    agentTrackingSettings: {
      findUnique: jest.fn().mockResolvedValue(settings),
    },
    dlpRule: {
      findMany: jest.fn().mockResolvedValue([{ id: 'r1', name: 'rule' }]),
    },
    legalDocumentVersion: {
      findFirst: jest.fn().mockResolvedValue(
        options.policy === false
          ? null
          : {
              id: 'v2',
              version: 2,
              contentMarkdown: 'text',
              document: { title: 'Policy' },
            },
      ),
    },
    legalDocumentAcknowledgement: {
      findFirst: jest
        .fn()
        .mockResolvedValue(options.acknowledged ? { id: 'a1' } : null),
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  (prisma as Record<string, unknown>).$transaction = jest.fn(
    (fn: (tx: unknown) => unknown) => fn(prisma),
  );
  const service = Object.assign(Object.create(AgentService.prototype), {
    prisma,
    auditService: audit,
  }) as AgentService;
  return { service, prisma, audit };
}

const USER = { tenantId: 't1', userId: 'u1' } as never;

describe('agent DLP consent gate in the config the agent receives', () => {
  it('turns capture off and ships no rules until the current policy is acknowledged', async () => {
    const { service } = build({ acknowledged: false });
    const config = (await service.getConfig('t1', 'u1')) as Record<string, any>;
    expect(config.privacy).toMatchObject({
      allowClipboardTracking: false,
      allowScreenshots: false,
    });
    expect(config.dlpConsent).toEqual({ required: true, granted: false });
    expect(JSON.stringify(config)).not.toContain('"rule"');
  });

  it('turns capture off when no policy is published (fails closed)', async () => {
    const { service } = build({ policy: false, acknowledged: true });
    const config = (await service.getConfig('t1', 'u1')) as Record<string, any>;
    expect(config.privacy.allowClipboardTracking).toBe(false);
    expect(config.dlpConsent.granted).toBe(false);
  });

  it('offers capture once the current policy is acknowledged', async () => {
    const { service } = build({ acknowledged: true });
    const config = (await service.getConfig('t1', 'u1')) as Record<string, any>;
    expect(config.privacy).toMatchObject({
      allowClipboardTracking: true,
      allowScreenshots: true,
    });
    expect(config.dlpConsent).toEqual({ required: true, granted: true });
  });

  it('cannot be waived by the tenant flag: consent is required whenever capture is on', async () => {
    const { service } = build({ consentRequired: false, acknowledged: false });
    const config = (await service.getConfig('t1', 'u1')) as Record<string, any>;
    expect(config.privacy.allowClipboardTracking).toBe(false);
    expect(config.dlpConsent).toEqual({ required: true, granted: false });
  });

  it('refuses an acknowledgement of a version that is not in force and records the right one', async () => {
    const { service, prisma, audit } = build({});
    await expect(
      service.acknowledgeMonitoringPolicy(USER, { versionId: 'old-version' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.legalDocumentAcknowledgement.create).not.toHaveBeenCalled();

    await expect(
      service.acknowledgeMonitoringPolicy(USER, { versionId: 'v2' }),
    ).resolves.toEqual({ acknowledged: true, versionId: 'v2' });
    expect(
      prisma.legalDocumentAcknowledgement.create.mock.calls[0][0].data,
    ).toMatchObject({
      legalDocumentVersionId: 'v2',
      tenantId: 't1',
      userId: 'u1',
    });
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  it('is idempotent when already acknowledged', async () => {
    const { service, prisma } = build({ acknowledged: true });
    await service.acknowledgeMonitoringPolicy(USER, { versionId: 'v2' });
    expect(prisma.legalDocumentAcknowledgement.create).not.toHaveBeenCalled();
  });
});
