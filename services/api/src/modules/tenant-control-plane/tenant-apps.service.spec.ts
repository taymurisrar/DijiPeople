import { compareSemver, resolveHeartbeatHealth } from './tenant-apps.service';
import {
  TENANT_APP_CATALOG,
  TENANT_PROVISIONING_STEPS,
  findTenantApp,
} from './tenant-control-plane.constants';

describe('tenant application catalogue', () => {
  it('does not present Platform Admin or the marketing site as tenant apps', () => {
    const keys = TENANT_APP_CATALOG.map((app) => app.appKey);
    expect(keys).not.toContain('PLATFORM_ADMIN');
    expect(keys).not.toContain('LANDING');
  });

  it('marks the hosted product as having no installable release', () => {
    expect(findTenantApp('DIJIPEOPLE_WEB')?.hasReleases).toBe(false);
  });

  it('treats the desktop agent and the gateway as versioned installables', () => {
    expect(findTenantApp('AGENT_DESKTOP')?.hasReleases).toBe(true);
    expect(findTenantApp('INTEGRATION_GATEWAY')?.hasReleases).toBe(true);
    expect(findTenantApp('INTEGRATION_GATEWAY')?.channelType).toBe(
      'ON_PREMISE',
    );
  });
});

describe('version comparison', () => {
  it('orders dotted numeric versions numerically, not lexically', () => {
    expect(compareSemver('1.9.0', '1.10.0')).toBe(-1);
    expect(compareSemver('1.4.2', '1.4.2')).toBe(0);
    expect(compareSemver('2.0.0', '1.99.99')).toBe(1);
  });

  it('treats a missing segment as zero', () => {
    expect(compareSemver('1.4', '1.4.0')).toBe(0);
  });

  it('degrades a non-numeric segment to zero rather than throwing', () => {
    expect(() => compareSemver('1.4.2-beta', '1.4.2')).not.toThrow();
  });
});

describe('gateway heartbeat health', () => {
  it('reports a gateway that has never connected distinctly from one that is offline', () => {
    expect(resolveHeartbeatHealth(null, null)).toBe('NEVER_CONNECTED');
    expect(
      resolveHeartbeatHealth(new Date(Date.now() - 6 * 60 * 60 * 1000), null),
    ).toBe('OFFLINE');
  });

  it('reports a recent heartbeat as online and a lapsed one as stale', () => {
    expect(resolveHeartbeatHealth(new Date(), null)).toBe('ONLINE');
    expect(
      resolveHeartbeatHealth(new Date(Date.now() - 20 * 60 * 1000), null),
    ).toBe('STALE');
  });

  it('reports a revoked gateway as revoked regardless of its last heartbeat', () => {
    expect(resolveHeartbeatHealth(new Date(), new Date())).toBe('REVOKED');
  });
});

describe('provisioning step definitions', () => {
  it('never marks the identity and billing step as retryable', () => {
    const step = TENANT_PROVISIONING_STEPS.find(
      (item) => item.key === 'identities-and-billing',
    );
    /* Replaying it would create a second owner, subscription and invoice. */
    expect(step?.isRetryable).toBe(false);
  });

  it('marks the idempotent steps as retryable', () => {
    for (const key of [
      'workspace-domain',
      'rbac-defaults',
      'customization-defaults',
    ]) {
      expect(
        TENANT_PROVISIONING_STEPS.find((item) => item.key === key)?.isRetryable,
      ).toBe(true);
    }
  });

  it('keeps the sequence contiguous and unique', () => {
    const sequences = TENANT_PROVISIONING_STEPS.map((step) => step.sequence);
    expect(new Set(sequences).size).toBe(sequences.length);
    expect([...sequences].sort((a, b) => a - b)).toEqual(sequences);
  });
});
