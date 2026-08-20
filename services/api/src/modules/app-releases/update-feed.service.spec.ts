import { ApplicationPlatform, ApplicationReleaseChannel } from '@prisma/client';
import { UpdateFeedService } from './update-feed.service';

/*
 * BUG-0034 — the desktop agent's updater requested `<url>/latest.yml` and
 * nothing served it, so every check 404'd. electron-updater swallows that, which
 * is why a permanently dead feed looked like a transient network blip.
 *
 * These tests pin the two things that make the feed usable rather than merely
 * present: the document is shaped the way electron-updater parses it, and a
 * release it could not verify is never advertised.
 */

function buildService(release: unknown) {
  const prisma = {
    applicationRelease: { findFirst: jest.fn(async () => release) },
  };
  return {
    service: new UpdateFeedService(prisma as never),
    prisma,
  };
}

const release = {
  id: 'release-1',
  appKey: 'agent-desktop',
  version: '1.10.0',
  platform: ApplicationPlatform.WINDOWS,
  channel: ApplicationReleaseChannel.STABLE,
  fileName: 'DijiPeople-Agent-Setup-1.10.0.exe',
  fileSizeBytes: 84_215_296,
  checksumSha512: 'Zm9vYmFyc2hhNTEyZGlnZXN0',
  publishedAt: new Date('2026-08-18T09:00:00.000Z'),
  createdAt: new Date('2026-08-17T09:00:00.000Z'),
};

describe('UpdateFeedService', () => {
  it('renders the fields electron-updater reads', async () => {
    const { service } = buildService(release);

    const yml = await service.latestYml(
      'agent-desktop',
      ApplicationPlatform.WINDOWS,
    );

    expect(yml).toContain("version: '1.10.0'");
    expect(yml).toContain("path: 'DijiPeople-Agent-Setup-1.10.0.exe'");
    expect(yml).toContain("sha512: 'Zm9vYmFyc2hhNTEyZGlnZXN0'");
    expect(yml).toContain('size: 84215296');
    expect(yml).toContain("releaseDate: '2026-08-18T09:00:00.000Z'");
    /* The `files:` list is what modern electron-updater actually consumes. */
    expect(yml).toContain('files:');
    expect(yml).toContain("  - url: 'DijiPeople-Agent-Setup-1.10.0.exe'");
  });

  it('quotes the version so YAML cannot reinterpret it', async () => {
    /*
     * The classic trap: unquoted `1.10` parses as the float 1.1 and the agent
     * then compares its own version against a number that lost a digit.
     */
    const { service } = buildService({ ...release, version: '1.10' });

    const yml = await service.latestYml(
      'agent-desktop',
      ApplicationPlatform.WINDOWS,
    );

    expect(yml).toContain("version: '1.10'");
    expect(yml).not.toContain('version: 1.10');
  });

  it('asks only for a publishable stable release', async () => {
    const { service, prisma } = buildService(release);

    await service.latestYml('agent-desktop', ApplicationPlatform.WINDOWS);

    const where = prisma.applicationRelease.findFirst.mock.calls[0][0].where;
    expect(where.channel).toBe(ApplicationReleaseChannel.STABLE);
    expect(where.isActive).toBe(true);
    /*
     * Everything the updater needs to verify the download. A release missing
     * any of these would be downloaded and then refused, and electron-updater
     * retries — so offering it is worse than offering nothing.
     */
    expect(where.checksumSha512).toEqual({ not: null });
    expect(where.fileName).toEqual({ not: null });
    expect(where.fileSizeBytes).toEqual({ not: null });
    expect(where.publishedAt).toEqual({ not: null });
  });

  it('returns null when nothing publishable exists', async () => {
    const { service } = buildService(null);

    await expect(
      service.latestYml('agent-desktop', ApplicationPlatform.WINDOWS),
    ).resolves.toBeNull();
  });

  it('falls back to createdAt when publishedAt is absent', async () => {
    const { service } = buildService({ ...release, publishedAt: null });

    const yml = await service.latestYml(
      'agent-desktop',
      ApplicationPlatform.WINDOWS,
    );

    expect(yml).toContain("releaseDate: '2026-08-17T09:00:00.000Z'");
  });
});
