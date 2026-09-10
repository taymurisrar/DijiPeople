import type { Readable } from 'stream';

/**
 * The storage backends this product knows how to talk to.
 *
 * `r2` is Cloudflare R2 over its S3-compatible API and is the only value that
 * may be used in production. `local` writes to the container filesystem and is
 * for local development and automated tests only — production refuses to boot
 * with it (see `resolveStorageConfig`), because a persistent business document
 * on an ephemeral disk is the P0 this module exists to close (FILE-01/INF-05).
 */
export type StorageProviderName = 'r2' | 'local';

/**
 * Where an object lives in the key namespace, and — more importantly — who is
 * allowed to name it.
 *
 * Every read and write goes through one of these. It is the structural half of
 * the FILE-03 fix: a storage key is no longer a bearer capability over the whole
 * bucket, because the caller must also state the scope it believes the key
 * belongs to, and the key is checked against it.
 */
export type StorageScope =
  | { readonly kind: 'tenant'; readonly tenantId: string }
  | { readonly kind: 'platform' };

export interface PutObjectInput {
  readonly key: string;
  readonly body: Buffer | Readable;
  readonly contentType: string;
  /**
   * Required. S3/R2 cannot stream a body of unknown length without falling back
   * to chunked upload, and an unbounded body is exactly the DoS shape FILE-05
   * described. Callers always know the size because the size limit was already
   * enforced before we got here.
   */
  readonly contentLength: number;
}

export interface PutObjectResult {
  readonly key: string;
  readonly size: number;
}

export interface GetObjectResult {
  readonly key: string;
  readonly size: number;
  readonly contentType: string | null;
  readonly stream: Readable;
}

export interface StorageReadiness {
  readonly provider: StorageProviderName;
  readonly ready: boolean;
  /** Safe to surface operationally. Never contains a bucket name, key or secret. */
  readonly detail: string;
  readonly latencyMs: number | null;
}

/**
 * The seam between DijiPeople's document logic and whichever object store is
 * configured. Business modules never see this type; they go through
 * `StorageService`. A future S3/Azure/sovereign-region provider implements this
 * interface and nothing in `modules/` changes.
 */
export interface ObjectStorageProvider {
  readonly name: StorageProviderName;

  putObject(input: PutObjectInput): Promise<PutObjectResult>;
  getObject(key: string): Promise<GetObjectResult>;
  deleteObject(key: string): Promise<void>;
  objectExists(key: string): Promise<boolean>;

  /**
   * A short-lived, single-object GET URL. Not used by the default download path
   * — downloads stream through the API so that `disableExternalDownloads` and
   * the audit trail keep applying — but the capability belongs on the provider
   * so that a large-file flow can adopt it without reopening this interface.
   *
   * The returned URL is an authorization artifact: never persist it, never log
   * it. See `docs/architecture/object-storage.md`.
   */
  getSignedDownloadUrl(
    key: string,
    options: { expiresInSeconds: number; downloadFileName?: string },
  ): Promise<string>;

  checkReadiness(): Promise<StorageReadiness>;
}

export const OBJECT_STORAGE_PROVIDER = Symbol('OBJECT_STORAGE_PROVIDER');

/**
 * Raised when the object store itself could not be reached or refused the
 * operation for a reason that is not "the object is absent".
 *
 * This is deliberately distinct from a not-found: §35 of the storage spec
 * requires that an R2 outage surfaces as a dependency failure rather than as
 * "document not found", because the two call for opposite operator responses.
 */
export class ObjectStorageUnavailableError extends Error {
  /**
   * Declared rather than relying on `Error.cause`: the API compiles against a
   * lib target that does not model it, and this value must never be serialised
   * into a client response anyway — it carries SDK detail including the bucket.
   */
  readonly underlying?: unknown;

  constructor(
    readonly operation: 'put' | 'get' | 'delete' | 'exists' | 'sign' | 'ready',
    underlying?: unknown,
  ) {
    super(`Object storage is unavailable (${operation}).`);
    this.name = 'ObjectStorageUnavailableError';
    this.underlying = underlying;
  }
}

/** The store answered, and the object is not there. */
export class ObjectNotFoundError extends Error {
  constructor(readonly key: string) {
    // The key is not interpolated into the message: it reaches audit rows and
    // error logs, and FILE-18 is about keys travelling further than they should.
    super('The requested stored object does not exist.');
    this.name = 'ObjectNotFoundError';
  }
}
