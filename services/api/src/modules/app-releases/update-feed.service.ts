import { Injectable, Logger } from '@nestjs/common';
import {
  ApplicationPlatform,
  ApplicationReleaseChannel,
  type ApplicationRelease,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { resolvePublishableApp } from './release-publisher.constants';

/*
 * The electron-updater feed for the desktop agent.
 *
 * BUG-0034 — `electron-updater`'s `generic` provider requests `<url>/latest.yml`
 * and nothing served it, so every agent 404'd on every check. The updater
 * swallows that failure, which is why a permanently dead feed looked like a
 * transient blip for months.
 *
 * Two constraints shape what this will serve, and both are load-bearing:
 *
 * 1. **Only STABLE.** `allowPrerelease` is false in the agent, so advertising a
 *    BETA build would be an update the client downloads and then refuses.
 *
 * 2. **sha512 or nothing.** electron-updater verifies the downloaded artefact
 *    against the digest in the feed and aborts the install on a mismatch. A
 *    release without `checksumSha512` is therefore skipped rather than
 *    advertised — offering it would produce a download that always fails
 *    verification, which is worse than no update at all, because the updater
 *    retries.
 *
 * Authentication is `UpdateFeedController`'s concern, and it is *not* public —
 * see the reasoning there. Both queries below apply the same publishable
 * conditions, so the filename lookup cannot reach a build the feed would refuse
 * to advertise.
 */
@Injectable()
export class UpdateFeedService {
  private readonly logger = new Logger(UpdateFeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The release electron-updater will ask for by filename, after reading the
   * feed. Scoped by exactly the same publishable conditions as `latestYml`, so
   * this cannot be used to reach a beta, an inactive, or an unverifiable build
   * by guessing its filename.
   */
  async findPublishableByFileName(appKey: string, fileName: string) {
    const catalogueAppKey = resolveCatalogueAppKey(appKey);
    if (!catalogueAppKey) return null;

    return this.prisma.applicationRelease.findFirst({
      where: {
        appKey: catalogueAppKey,
        fileName,
        channel: ApplicationReleaseChannel.STABLE,
        isActive: true,
        publishedAt: { not: null },
        checksumSha512: { not: null },
      },
      select: { id: true },
    });
  }

  async latestYml(
    appKey: string,
    platform: ApplicationPlatform,
  ): Promise<string | null> {
    const catalogueAppKey = resolveCatalogueAppKey(appKey);

    if (!catalogueAppKey) {
      this.logger.debug(
        `Update feed requested for unknown appKey=${appKey}`,
      );
      return null;
    }

    const release = await this.prisma.applicationRelease.findFirst({
      where: {
        appKey: catalogueAppKey,
        platform,
        channel: ApplicationReleaseChannel.STABLE,
        isActive: true,
        publishedAt: { not: null },
        /*
         * Everything the updater needs to verify the download. A release
         * missing any of these cannot be installed, so it must not be offered.
         */
        checksumSha512: { not: null },
        fileName: { not: null },
        fileSizeBytes: { not: null },
      },
      orderBy: { publishedAt: 'desc' },
    });

    if (!release) {
      this.logger.debug(
        `No publishable release for appKey=${catalogueAppKey} platform=${platform}`,
      );
      return null;
    }

    return this.renderLatestYml(release);
  }

  /*
   * Rendered by hand rather than through a YAML library.
   *
   * The document is four scalars and one list entry, and electron-updater parses
   * it with js-yaml in safe mode — so the only real risk is an unquoted value
   * that YAML reinterprets. `version` is the classic trap: an unquoted `1.10`
   * parses as a float and loses the trailing zero. Every string is therefore
   * quoted, and the two values that could contain a quote are escaped.
   */
  private renderLatestYml(release: ApplicationRelease): string {
    const fileName = release.fileName ?? '';
    const sha512 = release.checksumSha512 ?? '';
    const size = release.fileSizeBytes ?? 0;
    const releaseDate = (
      release.publishedAt ?? release.createdAt
    ).toISOString();

    return [
      `version: ${quote(release.version)}`,
      'files:',
      `  - url: ${quote(fileName)}`,
      `    sha512: ${quote(sha512)}`,
      `    size: ${size}`,
      `path: ${quote(fileName)}`,
      `sha512: ${quote(sha512)}`,
      `releaseDate: ${quote(releaseDate)}`,
      '',
    ].join('\n');
  }
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Map the app segment in the feed URL onto the key releases are stored under.
 *
 * BUG-1551. `electron-updater` is pointed at
 * `/api/app-releases/feed/agent-desktop` — the catalogue `cliAlias`, because
 * that is what a URL segment looks like and what every `.env` example has
 * always carried. The publisher, meanwhile, persists `appKey` from `APP_KEYS`,
 * which is `AGENT_DESKTOP`. Both queries here filtered on the raw URL segment,
 * so `'agent-desktop'` never matched `'AGENT_DESKTOP'` and the feed answered 404
 * for every request — including the ones it would answer after a release was
 * finally published. The empty feed hid the mismatch: with no releases at all,
 * a correct lookup and a broken one return the same 404.
 *
 * `resolvePublishableApp` already normalises case and `_`/`-` in both
 * directions and is what the publisher uses, so routing through it makes the
 * read side agree with the write side by construction rather than by a second
 * mapping that could drift.
 *
 * An unrecognised segment resolves to `null` and the caller answers 404, which
 * is the right answer for an app that does not exist.
 */
function resolveCatalogueAppKey(appKey: string): string | null {
  return resolvePublishableApp(appKey)?.appKey ?? null;
}
