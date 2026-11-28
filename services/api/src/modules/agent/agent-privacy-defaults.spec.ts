import { AgentService } from './agent.service';

/*
 * DP-MASTER/WP-17.S2 (OD-DLP-DEFAULTS, D16). New tenants start with window-title
 * capture off and DLP consent required, and a tenant's saved choice is never
 * silently rewritten on read (it used to be switched back ON).
 */
function build(existing: unknown) {
  const settings = {
    findUnique: jest.fn().mockResolvedValue(existing),
    create: jest.fn(({ data }: { data: unknown }) => Promise.resolve(data)),
    update: jest.fn(),
  };
  const service = Object.assign(Object.create(AgentService.prototype), {
    prisma: { agentTrackingSettings: settings },
  }) as unknown as {
    getOrCreateSettings(tenantId: string): Promise<Record<string, unknown>>;
  };
  return { service, settings };
}

describe('agent privacy defaults', () => {
  it('creates new tenant settings with titles off and consent required', async () => {
    const { service, settings } = build(null);
    const created = await service.getOrCreateSettings('t1');
    expect(created).toMatchObject({
      tenantId: 't1',
      captureWindowTitle: false,
      dlpConsentRequired: true,
    });
    expect(settings.create).toHaveBeenCalledTimes(1);
  });

  it('returns an opted-out tenant unchanged instead of re-enabling titles', async () => {
    const existing = {
      tenantId: 't1',
      enabled: true,
      captureActiveApp: true,
      captureWindowTitle: false,
    };
    const { service, settings } = build(existing);
    await expect(service.getOrCreateSettings('t1')).resolves.toBe(existing);
    expect(settings.update).not.toHaveBeenCalled();
  });
});
