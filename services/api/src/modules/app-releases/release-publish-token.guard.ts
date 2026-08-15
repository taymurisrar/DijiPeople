import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

import { AppError } from '../../common/errors/app-error';

export const RELEASE_TOKEN_HEADER = 'x-dijipeople-release-token';

/** Shortest token this guard will accept as configuration. */
export const MINIMUM_RELEASE_TOKEN_LENGTH = 32;

/**
 * What a request that got past this guard is allowed to say about itself.
 *
 * There is no user here. Publishing is machine-to-machine, so the "actor"
 * recorded in the audit trail is a label the caller supplies plus the token
 * fingerprint the platform can match back to an issued credential.
 */
export interface ReleasePublisherIdentity {
  /** Free-text, caller supplied: a CI run URL, a developer's machine name. */
  actorLabel: string;
  /** First 12 hex characters of the SHA-256 of the presented token. */
  credentialFingerprint: string;
}

export interface ReleasePublisherRequest extends Request {
  releasePublisher?: ReleasePublisherIdentity;
}

/**
 * Authenticates the release publisher.
 *
 * WHY NOT A USER SESSION. A developer CLI and a GitHub Actions job have no
 * browser, no cookie jar and no refresh cycle, and giving them a platform
 * administrator's email and password would put an interactive human credential
 * — one that can do everything in `super-admin` — into CI secrets to do one
 * thing. This is a purpose-scoped machine credential instead: it can publish
 * releases and it can do nothing else, because the only routes it opens are the
 * publisher's.
 *
 * FAILS CLOSED. If `RELEASE_PUBLISH_TOKEN` is unset, blank, or shorter than
 * MINIMUM_RELEASE_TOKEN_LENGTH, every request is rejected. An environment that
 * has not deliberately enabled publishing cannot be published to, and there is
 * no development default that would quietly become the production one.
 *
 * The comparison is over SHA-256 digests rather than the raw strings: digests
 * are always the same length, so `timingSafeEqual` cannot throw on a
 * length mismatch and the comparison leaks neither length nor prefix.
 */
@Injectable()
export class ReleasePublishTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<ReleasePublisherRequest>();

    const configured = String(
      this.config.get<string>('RELEASE_PUBLISH_TOKEN') ?? '',
    ).trim();

    if (configured.length < MINIMUM_RELEASE_TOKEN_LENGTH) {
      throw new AppError('RELEASE_PUBLISH_UNAUTHORIZED', {
        description:
          'Release publishing is not enabled on this environment. RELEASE_PUBLISH_TOKEN is unset or too short.',
      });
    }

    const presentedHeader = request.headers[RELEASE_TOKEN_HEADER];
    const presented = String(
      Array.isArray(presentedHeader)
        ? presentedHeader[0]
        : (presentedHeader ?? ''),
    ).trim();

    if (presented.length === 0) {
      throw new AppError('RELEASE_PUBLISH_UNAUTHORIZED');
    }

    const presentedDigest = createHash('sha256').update(presented).digest();
    const configuredDigest = createHash('sha256').update(configured).digest();

    if (!timingSafeEqual(presentedDigest, configuredDigest)) {
      throw new AppError('RELEASE_PUBLISH_UNAUTHORIZED');
    }

    const rawLabel = request.headers['x-dijipeople-release-actor'];
    const actorLabel = String(
      Array.isArray(rawLabel) ? rawLabel[0] : (rawLabel ?? 'release-publisher'),
    )
      .replace(/[^\x20-\x7E]/g, '')
      .trim()
      .slice(0, 200);

    request.releasePublisher = {
      actorLabel: actorLabel.length > 0 ? actorLabel : 'release-publisher',
      // Identifies WHICH credential published without storing or logging it.
      credentialFingerprint: presentedDigest.toString('hex').slice(0, 12),
    };

    return true;
  }
}
