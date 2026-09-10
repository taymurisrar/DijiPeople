import { resolveStorageConfig } from './storage.config';

const R2_ENV = {
  STORAGE_PROVIDER: 'r2',
  R2_BUCKET_NAME: 'dijipeople-prod-files',
  R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
  R2_ACCESS_KEY_ID: 'a'.repeat(32),
  R2_SECRET_ACCESS_KEY: 'b'.repeat(64),
  R2_ACCOUNT_ID: 'c'.repeat(32),
  R2_REGION: 'auto',
};

/**
 * The configuration rules are the mechanism that keeps FILE-01/INF-05 closed.
 *
 * The original defect was not that someone chose the wrong storage backend — it
 * was that an unset variable silently produced a relative path inside an
 * ephemeral container, and nothing anywhere objected. Every assertion here is
 * about refusing to start rather than starting in a state where uploads look
 * like they worked.
 */
describe('resolveStorageConfig', () => {
  describe('production', () => {
    const PRODUCTION = { NODE_ENV: 'production' };

    it('refuses local storage outright', () => {
      const { config, errors } = resolveStorageConfig({
        ...PRODUCTION,
        STORAGE_PROVIDER: 'local',
        FILE_STORAGE_DIR: '/var/data/storage',
      });

      expect(config).toBeNull();
      expect(errors.join(' ')).toMatch(/not permitted in production/i);
    });

    it('refuses to default to anything when STORAGE_PROVIDER is unset', () => {
      // This is the exact production state the audit found: no provider
      // configured, and the previous code quietly fell back to `storage/uploads`
      // relative to the working directory.
      const { config, errors } = resolveStorageConfig(PRODUCTION);

      expect(config).toBeNull();
      expect(errors.join(' ')).toMatch(/must be set to "r2" in production/i);
    });

    it.each([
      'R2_BUCKET_NAME',
      'R2_ENDPOINT',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
    ])('refuses to start when %s is missing', (missingKey) => {
      const env: NodeJS.ProcessEnv = { ...PRODUCTION, ...R2_ENV };
      delete env[missingKey];

      const { config, errors } = resolveStorageConfig(env);

      expect(config).toBeNull();
      expect(errors.join(' ')).toContain(missingKey);
    });

    it('refuses a plaintext endpoint', () => {
      const { config, errors } = resolveStorageConfig({
        ...PRODUCTION,
        ...R2_ENV,
        R2_ENDPOINT: 'http://account.r2.cloudflarestorage.com',
      });

      expect(config).toBeNull();
      expect(errors.join(' ')).toMatch(/https/i);
    });

    it('accepts a complete R2 configuration', () => {
      const { config, errors } = resolveStorageConfig({
        ...PRODUCTION,
        ...R2_ENV,
      });

      expect(errors).toHaveLength(0);
      expect(config).toMatchObject({
        provider: 'r2',
        bucket: 'dijipeople-prod-files',
        region: 'auto',
      });
    });

    it('treats APP_ENV=production the same as NODE_ENV=production', () => {
      const { config } = resolveStorageConfig({
        APP_ENV: 'production',
        STORAGE_PROVIDER: 'local',
      });

      expect(config).toBeNull();
    });

    it.each([
      ['NODE_ENV', 'staging'],
      ['APP_ENV', 'staging'],
      ['NODE_ENV', 'PRODUCTION'],
      ['NODE_ENV', ' production '],
    ])('refuses local storage when %s is %p', (key, value) => {
      // Staging on Render has the same ephemeral filesystem as production, and
      // it is where releases get signed off, so losing documents there is not a
      // lesser problem. Casing and stray whitespace must not open the gate
      // either.
      const { config } = resolveStorageConfig({
        [key]: value,
        STORAGE_PROVIDER: 'local',
      });

      expect(config).toBeNull();
    });

    it('does not let a development NODE_ENV mask a production APP_ENV', () => {
      const { config } = resolveStorageConfig({
        NODE_ENV: 'development',
        APP_ENV: 'production',
        STORAGE_PROVIDER: 'local',
      });

      expect(config).toBeNull();
    });
  });

  describe('development', () => {
    it('defaults to local storage when nothing is configured', () => {
      const { config } = resolveStorageConfig({ NODE_ENV: 'development' });

      expect(config).toMatchObject({ provider: 'local' });
    });

    it('still refuses an unknown provider name', () => {
      const { config, errors } = resolveStorageConfig({
        NODE_ENV: 'development',
        STORAGE_PROVIDER: 's3',
      });

      expect(config).toBeNull();
      expect(errors.join(' ')).toMatch(/"r2" or "local"/);
    });

    it('allows R2 so a developer can point at a non-production bucket', () => {
      const { config } = resolveStorageConfig({
        NODE_ENV: 'development',
        ...R2_ENV,
        R2_BUCKET_NAME: 'dijipeople-dev-files',
      });

      expect(config).toMatchObject({
        provider: 'r2',
        bucket: 'dijipeople-dev-files',
      });
    });
  });

  it('never returns a configuration that carries a fallback backend', () => {
    const { config } = resolveStorageConfig({
      NODE_ENV: 'production',
      ...R2_ENV,
    });

    // There is no `fallback`, `secondary` or `localRoot` on an R2 config, by
    // construction. If one is ever added, this fails and the reviewer has to
    // justify why production may write a persistent document to a disk.
    expect(Object.keys(config ?? {})).not.toContain('fallback');
    expect(Object.keys(config ?? {})).not.toContain('root');
  });
});
