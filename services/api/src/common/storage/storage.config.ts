import type { StorageProviderName } from './object-storage.types';

/**
 * Bytes. The ceiling no upload may pass regardless of what a tenant setting
 * says. Individual endpoints set lower limits appropriate to their content
 * (see `UPLOAD_LIMITS`); this is the backstop.
 */
export const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Bytes. Release installers are the one legitimately large artifact, and they
 * are published by platform staff rather than by tenant users.
 */
export const DEFAULT_MAX_RELEASE_UPLOAD_BYTES = 512 * 1024 * 1024;

export interface R2StorageConfig {
  readonly provider: 'r2';
  readonly bucket: string;
  readonly endpoint: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly requestTimeoutMs: number;
  readonly maxAttempts: number;
  readonly maxUploadBytes: number;
}

export interface LocalStorageConfig {
  readonly provider: 'local';
  readonly root: string;
  readonly maxUploadBytes: number;
}

export type StorageConfig = R2StorageConfig | LocalStorageConfig;

export interface StorageConfigResolution {
  readonly config: StorageConfig | null;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

const R2_REQUIRED_KEYS = [
  'R2_BUCKET_NAME',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
] as const;

/**
 * Resolve the storage backend from the environment.
 *
 * Two rules make this fail closed, and they are the reason the original P0
 * cannot come back by accident:
 *
 *   1. In production, `local` is not a permitted provider. A container
 *      filesystem is not durable on Render, so silently accepting it would
 *      reintroduce FILE-01 the moment someone forgot a variable.
 *   2. When `r2` is selected, every required key must be present and shaped
 *      correctly. A partially configured provider errors at boot rather than at
 *      the first upload, because the first upload is a customer's employment
 *      contract.
 *
 * There is deliberately no "try R2, fall back to disk" path anywhere in this
 * module. That behaviour is what the audit found and what §10 forbids.
 */
export function resolveStorageConfig(
  env: NodeJS.ProcessEnv,
): StorageConfigResolution {
  const errors: string[] = [];
  const warnings: string[] = [];
  const production = isProductionLike(env);

  const requested = (env.STORAGE_PROVIDER ?? '').trim().toLowerCase();
  const provider: StorageProviderName | null =
    requested === 'r2'
      ? 'r2'
      : requested === 'local'
        ? 'local'
        : requested === ''
          ? production
            ? null
            : 'local'
          : null;

  if (provider === null) {
    errors.push(
      requested === ''
        ? 'STORAGE_PROVIDER must be set to "r2" in production. Persistent documents cannot live on the container filesystem.'
        : 'STORAGE_PROVIDER must be either "r2" or "local".',
    );
    return { config: null, errors, warnings };
  }

  const maxUploadBytes = parsePositiveInteger(
    env.FILE_UPLOAD_MAX_BYTES,
    DEFAULT_MAX_UPLOAD_BYTES,
  );

  if (provider === 'local') {
    if (production) {
      errors.push(
        'STORAGE_PROVIDER=local is not permitted in production. The container filesystem is ephemeral on Render, so uploaded documents would be destroyed by the next deploy (FILE-01/INF-05).',
      );
      return { config: null, errors, warnings };
    }

    if (env.FILE_STORAGE_DIR && env.FILE_STORAGE_DIR.trim().length === 0) {
      errors.push('FILE_STORAGE_DIR must not be blank when it is set.');
    }

    return {
      config: {
        provider: 'local',
        root: (env.FILE_STORAGE_DIR ?? 'storage/uploads').trim(),
        maxUploadBytes,
      },
      errors,
      warnings,
    };
  }

  for (const key of R2_REQUIRED_KEYS) {
    if (!hasValue(env[key])) {
      errors.push(`${key} is required when STORAGE_PROVIDER=r2.`);
    }
  }

  const endpoint = (env.R2_ENDPOINT ?? '').trim();
  if (hasValue(endpoint) && !isHttpsUrl(endpoint)) {
    // Not "must be a URL": an http endpoint would put HR documents and the
    // signing credentials on the wire in clear text.
    errors.push('R2_ENDPOINT must be an https URL.');
  }

  const bucket = (env.R2_BUCKET_NAME ?? '').trim();
  if (hasValue(bucket) && !/^[a-z0-9][a-z0-9.-]{1,62}$/.test(bucket)) {
    errors.push('R2_BUCKET_NAME is not a valid bucket name.');
  }

  if (errors.length > 0) {
    return { config: null, errors, warnings };
  }

  if (!hasValue(env.R2_ACCOUNT_ID)) {
    // Not required to talk to the bucket — the endpoint already carries the
    // account — but its absence usually means the configuration was assembled
    // by hand and something else is missing too.
    warnings.push(
      'R2_ACCOUNT_ID is not set. It is not required for S3 API access but is expected alongside the other R2 settings.',
    );
  }

  return {
    config: {
      provider: 'r2',
      bucket,
      endpoint,
      region: (env.R2_REGION ?? 'auto').trim() || 'auto',
      accessKeyId: (env.R2_ACCESS_KEY_ID ?? '').trim(),
      secretAccessKey: (env.R2_SECRET_ACCESS_KEY ?? '').trim(),
      requestTimeoutMs: parsePositiveInteger(env.R2_REQUEST_TIMEOUT_MS, 15_000),
      maxAttempts: parsePositiveInteger(env.R2_MAX_ATTEMPTS, 3),
      maxUploadBytes,
    },
    errors,
    warnings,
  };
}

/**
 * A one-line description safe to log at boot and to return from an operational
 * readiness probe. Names the provider and nothing else — §36 rules out exposing
 * the bucket name, endpoint or any credential through diagnostics.
 */
export function describeStorageConfig(config: StorageConfig): string {
  return config.provider === 'r2'
    ? 'object storage: r2 (private bucket, server-side credentials)'
    : `object storage: local filesystem (development only, root "${config.root}")`;
}

function hasValue(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Which environments must have durable storage.
 *
 * `staging` counts, matching `isProductionLike` in `config/env.validation.ts`.
 * A staging instance on Render has the same ephemeral filesystem as production,
 * so permitting the local provider there would reproduce FILE-01 somewhere that
 * is also used to sign off releases.
 *
 * Unlike that function this checks both variables rather than falling back from
 * one to the other, so `NODE_ENV=development` cannot mask `APP_ENV=production`.
 * Erring toward "this is production" is the safe direction: the cost of being
 * wrong is a developer having to name a provider, against silently losing a
 * customer's documents.
 */
function isProductionLike(env: NodeJS.ProcessEnv): boolean {
  const durable = ['production', 'staging'];
  const nodeEnv = (env.NODE_ENV ?? '').trim().toLowerCase();
  const appEnv = (env.APP_ENV ?? '').trim().toLowerCase();
  return durable.includes(nodeEnv) || durable.includes(appEnv);
}
