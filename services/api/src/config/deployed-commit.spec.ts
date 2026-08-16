import {
  getRuntimeHealthPayload,
  resolveDeployedCommit,
} from './env.validation';

/**
 * ITEM-0010 — the deployed commit must be observable from outside, and honest
 * when it is not known.
 *
 * The value of this field is entirely in being trustworthy. A release record
 * that carries an observed SHA is evidence; one that carries a *plausible* SHA
 * is worse than one carrying nothing, because it will be believed.
 */
describe('resolveDeployedCommit', () => {
  const SHA = '1af3690d8ebe99a14d58d11b6c067286c000c019';

  it('reads the explicit override first', () => {
    // The override exists for hosts that inject nothing of their own; it must
    // win over a platform variable left behind by a build image.
    expect(
      resolveDeployedCommit({
        GIT_COMMIT_SHA: SHA,
        RENDER_GIT_COMMIT: 'stale',
      } as NodeJS.ProcessEnv),
    ).toBe(SHA);
  });

  it('falls back through the platform variables', () => {
    for (const key of [
      'RENDER_GIT_COMMIT',
      'VERCEL_GIT_COMMIT_SHA',
      'GITHUB_SHA',
      'SOURCE_VERSION',
    ]) {
      expect(resolveDeployedCommit({ [key]: SHA } as NodeJS.ProcessEnv)).toBe(
        SHA,
      );
    }
  });

  it('reports unknown rather than inventing one', () => {
    expect(resolveDeployedCommit({} as NodeJS.ProcessEnv)).toBe('unknown');
  });

  it('treats a blank value as unknown', () => {
    // An empty platform variable is absence, not a commit named "".
    expect(
      resolveDeployedCommit({ RENDER_GIT_COMMIT: '   ' } as NodeJS.ProcessEnv),
    ).toBe('unknown');
  });

  it('never derives a SHA from the local checkout', () => {
    /*
     * The tempting shortcut is `git rev-parse HEAD`. In a running deployment
     * that reports the commit of whoever is asking — which is not the deployed
     * commit and may be nothing at all. A wrong-but-plausible SHA in a release
     * record is worse than an honest "unknown".
     */
    const resolved = resolveDeployedCommit({} as NodeJS.ProcessEnv);
    expect(resolved).toBe('unknown');
    expect(resolved).not.toMatch(/^[0-9a-f]{7,40}$/);
  });
});

describe('health payload', () => {
  it('exposes the commit in full and short form', () => {
    const payload = getRuntimeHealthPayload({
      GIT_COMMIT_SHA: '1af3690d8ebe99a14d58d11b6c067286c000c019',
    } as NodeJS.ProcessEnv);

    expect(payload.commit).toBe('1af3690d8ebe99a14d58d11b6c067286c000c019');
    expect(payload.commitShort).toBe('1af3690');
  });

  it('does not shorten an unknown commit into something that looks like one', () => {
    const payload = getRuntimeHealthPayload({} as NodeJS.ProcessEnv);

    expect(payload.commit).toBe('unknown');
    // `'unknown'.slice(0, 7)` is `'unknown'` by luck; assert it explicitly so a
    // change to the short form cannot start emitting `unknow`.
    expect(payload.commitShort).toBe('unknown');
  });
});
