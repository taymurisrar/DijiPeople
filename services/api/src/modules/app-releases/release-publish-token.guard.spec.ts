import type { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error';
import {
  RELEASE_TOKEN_HEADER,
  ReleasePublishTokenGuard,
  type ReleasePublisherRequest,
} from './release-publish-token.guard';

/**
 * The release publishing credential.
 *
 * One property matters more than the rest: an environment that has not
 * deliberately enabled publishing must be unpublishable. There is no
 * development default, so a token that works locally cannot become the one
 * guarding production.
 */
describe('ReleasePublishTokenGuard', () => {
  const VALID_TOKEN = 'r'.repeat(48);

  function contextFor(headers: Record<string, string>) {
    const request = { headers } as unknown as ReleasePublisherRequest;
    return {
      request,
      context: {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext,
    };
  }

  function guardWith(configured: string | undefined) {
    return new ReleasePublishTokenGuard({
      get: jest.fn().mockReturnValue(configured),
    } as unknown as ConfigService);
  }

  function codeOf(run: () => unknown) {
    try {
      run();
      return 'NO_ERROR_THROWN';
    } catch (error) {
      return error instanceof AppError ? error.errorCode : String(error);
    }
  }

  it('rejects every request when no token is configured', () => {
    const { context } = contextFor({ [RELEASE_TOKEN_HEADER]: VALID_TOKEN });

    expect(codeOf(() => guardWith(undefined).canActivate(context))).toBe(
      'RELEASE_PUBLISH_UNAUTHORIZED',
    );
  });

  it('rejects a configured token that is too short to be a credential', () => {
    const { context } = contextFor({ [RELEASE_TOKEN_HEADER]: 'short' });

    expect(codeOf(() => guardWith('short').canActivate(context))).toBe(
      'RELEASE_PUBLISH_UNAUTHORIZED',
    );
  });

  it('rejects a request with no token header', () => {
    const { context } = contextFor({});

    expect(codeOf(() => guardWith(VALID_TOKEN).canActivate(context))).toBe(
      'RELEASE_PUBLISH_UNAUTHORIZED',
    );
  });

  it('rejects a wrong token of the same length', () => {
    const { context } = contextFor({ [RELEASE_TOKEN_HEADER]: 'x'.repeat(48) });

    expect(codeOf(() => guardWith(VALID_TOKEN).canActivate(context))).toBe(
      'RELEASE_PUBLISH_UNAUTHORIZED',
    );
  });

  it('rejects a token that is only a prefix of the configured one', () => {
    const { context } = contextFor({ [RELEASE_TOKEN_HEADER]: 'r'.repeat(47) });

    expect(codeOf(() => guardWith(VALID_TOKEN).canActivate(context))).toBe(
      'RELEASE_PUBLISH_UNAUTHORIZED',
    );
  });

  it('accepts the configured token and attaches a publisher identity', () => {
    const { context, request } = contextFor({
      [RELEASE_TOKEN_HEADER]: VALID_TOKEN,
      'x-dijipeople-release-actor': 'github-actions:acme/repo#42',
    });

    expect(guardWith(VALID_TOKEN).canActivate(context)).toBe(true);
    expect(request.releasePublisher?.actorLabel).toBe(
      'github-actions:acme/repo#42',
    );
    // A fingerprint, not the credential.
    expect(request.releasePublisher?.credentialFingerprint).toHaveLength(12);
    expect(request.releasePublisher?.credentialFingerprint).not.toContain(
      VALID_TOKEN,
    );
  });

  it('falls back to a neutral actor label when none is supplied', () => {
    const { context, request } = contextFor({
      [RELEASE_TOKEN_HEADER]: VALID_TOKEN,
    });

    guardWith(VALID_TOKEN).canActivate(context);
    expect(request.releasePublisher?.actorLabel).toBe('release-publisher');
  });

  it('strips control characters from a caller-supplied actor label', () => {
    const { context, request } = contextFor({
      [RELEASE_TOKEN_HEADER]: VALID_TOKEN,
      // The label reaches an audit row and a log line, so it must not be able
      // to carry newlines or escape sequences into either.
      'x-dijipeople-release-actor': 'ci\n\r[31mINJECTED',
    });

    guardWith(VALID_TOKEN).canActivate(context);
    expect(request.releasePublisher?.actorLabel).toBe('ci[31mINJECTED');
  });
});
