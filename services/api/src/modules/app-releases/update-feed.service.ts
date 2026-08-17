import { Injectable, Logger } from '@nestjs/common';
import {
  ApplicationPlatform,
  ApplicationReleaseChannel,
  type ApplicationRelease,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/*
 * The electron-updater feed for the desktop agent.
 *
 * BUG-0034 — `electron-updater`'s `generic` provider requests `<url>/latest.yml`
 * and nothing served it, so every agent 404'd on every check. The updater
 * swallows that failure, which is why a permanently dead feed looked like a
 * transient blip for months.
 *
 * Three constraints shape this, and each one is load-bearing:
 *
 * 1. **It is unauthenticated.** The updater fetches the feed from the Electron
 *    main process with no session — the agent may not be logged in, and an
 *    update is most needed when it is broken. So this serves only what a
 *    published installer already reveals: a version number, a filename, a size
 *    and a digest. No tenant data is reachable from here.
 *
 * 2. **Only STABLE.** `allowPrerelease` is false in the agent, so advertising a
 *    BETA build would be a downloadable update the client then refuses.
 *
 * 3. **sha512 or nothing.** electron-updater verifies the downloaded artefact
 *    against the digest in the feed and aborts the install on a mismatch. A
 *    release without `checksumSha512` is therefore skipped rather than
 *    advertised — offering it would produce a download that always fails
 *    verification, which is a worse failure than no update at all because it
 *    retries forever.
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
    return this.prisma.applicationRelease.findFirst({
      where: {
        appKey,
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
    const release = await this.prisma.applicationRelease.findFirst({
      where: {
        appKey,
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
        `No publishable release for appKey=${appKey} platform=${platform}`,
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
    const releaseDate = (release.publishedAt ?? release.createdAt).toISOString();

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
