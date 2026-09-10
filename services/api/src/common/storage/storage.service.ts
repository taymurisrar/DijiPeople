import { createHash } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Readable } from 'stream';

import { AppError } from '../errors/app-error';
import {
  OBJECT_STORAGE_PROVIDER,
  ObjectNotFoundError,
  ObjectStorageUnavailableError,
  type ObjectStorageProvider,
  type StorageReadiness,
  type StorageScope,
} from './object-storage.types';
import {
  buildObjectKey,
  isKeyInScope,
  normalizeKey,
  type StorageDomain,
} from './storage-keys';
import { STORAGE_CONFIG } from './storage.tokens';
import type { StorageConfig } from './storage.config';

export interface SaveFileInput {
  readonly buffer: Buffer;
  readonly originalFileName: string;
  readonly contentType: string;
  /** Who owns the bytes. Sets the key prefix, and is checked on every later read. */
  readonly scope: StorageScope;
  readonly domain: StorageDomain;
  /** Opaque entity identifiers only. Never names, emails or filenames. */
  readonly segments?: readonly string[];
}

export interface SaveFileResult {
  readonly storageKey: string;
  readonly size: number;
  readonly checksumSha256: string;
  readonly storageProvider: string;
}

export interface OpenFileResult {
  readonly storageKey: string;
  readonly size: number;
  readonly contentType: string | null;
  readonly stream: Readable;
}

/**
 * The one way DijiPeople reads or writes a stored file.
 *
 * Two things changed here relative to the implementation the audit examined,
 * and both are load-bearing:
 *
 *   1. **The backend is pluggable and production-durable.** Bytes go to
 *      Cloudflare R2 in production. The local filesystem is a development
 *      provider that production cannot select, so a deploy can no longer
 *      destroy a customer's signed employment contract (FILE-01/INF-05).
 *
 *   2. **Every operation states its scope.** `openFile` will not read a key
 *      that does not belong to the scope the caller claims. Together with
 *      removing `storageKey` from request DTOs, that ends the situation where
 *      knowing a key was equivalent to being authorized for it (FILE-03).
 *
 * Business modules must not reach past this class to the provider. That
 * indirection is what keeps Cloudflare out of domain logic.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    @Inject(OBJECT_STORAGE_PROVIDER)
    private readonly provider: ObjectStorageProvider,
    @Inject(STORAGE_CONFIG)
    private readonly config: StorageConfig,
  ) {}

  getMaxUploadBytes(): number {
    return this.config.maxUploadBytes;
  }

  getProviderName(): string {
    return this.provider.name;
  }

  /**
   * Store bytes and return the durable identity of the object.
   *
   * The caller does not choose the key. It is derived from the scope, the
   * domain and opaque identifiers, so a tenant's objects sit structurally
   * inside that tenant's prefix rather than by each call site's own convention
   * (FILE-15).
   */
  async saveFile(input: SaveFileInput): Promise<SaveFileResult> {
    if (!Buffer.isBuffer(input.buffer) || input.buffer.byteLength === 0) {
      throw new AppError('FILE_UPLOAD_FAILED', {
        message: 'The uploaded file is empty.',
      });
    }

    if (input.buffer.byteLength > this.config.maxUploadBytes) {
      // A backstop, not the primary limit. Multer aborts oversized bodies at
      // the boundary so they never reach here (FILE-05); this catches a
      // server-generated artifact that grew past what the store should hold.
      throw new AppError('FILE_TOO_LARGE', {
        message: 'The file exceeds the maximum size this platform stores.',
      });
    }

    const storageKey = buildObjectKey({
      scope: input.scope,
      domain: input.domain,
      segments: input.segments,
      originalFileName: input.originalFileName,
    });

    // Hashed from the buffer we are about to send, so the recorded checksum
    // describes exactly the bytes that were stored. Reconciliation and
    // integrity checks depend on that being true.
    const checksumSha256 = createHash('sha256')
      .update(input.buffer)
      .digest('hex');

    try {
      const result = await this.provider.putObject({
        key: storageKey,
        body: input.buffer,
        contentType: input.contentType,
        contentLength: input.buffer.byteLength,
      });

      return {
        storageKey: result.key,
        size: result.size,
        checksumSha256,
        storageProvider: this.provider.name,
      };
    } catch (error) {
      // The write failed, so no metadata row may be created claiming the file
      // exists. Callers persist the row only after this resolves, which is what
      // keeps a row from pointing at nothing.
      throw this.toAppError(error, 'store');
    }
  }

  /**
   * Read an object the caller has already been authorized for.
   *
   * `scope` is mandatory. It is the second lock; the first is that
   * `storageKey` came from a row fetched under a tenant filter rather than from
   * the request body.
   */
  async openFile(
    storageKey: string | null | undefined,
    scope: StorageScope,
  ): Promise<OpenFileResult> {
    const key = this.assertKeyForScope(storageKey, scope);

    try {
      const object = await this.provider.getObject(key);
      return {
        storageKey: key,
        size: object.size,
        contentType: object.contentType,
        stream: object.stream,
      };
    } catch (error) {
      throw this.toAppError(error, 'read');
    }
  }

  /**
   * Read a whole object into memory.
   *
   * Only for callers that genuinely need the bytes as a unit — an email
   * attachment, a PDF being merged. Every download path streams instead.
   * Bounded by the configured maximum so a large object cannot be pulled into
   * the heap by accident.
   */
  async readFileBuffer(
    storageKey: string | null | undefined,
    scope: StorageScope,
  ): Promise<Buffer> {
    const opened = await this.openFile(storageKey, scope);

    if (opened.size > this.config.maxUploadBytes) {
      opened.stream.destroy();
      throw new AppError('FILE_TOO_LARGE', {
        message: 'The stored file is too large to load into memory.',
      });
    }

    const chunks: Buffer[] = [];
    let total = 0;

    for await (const chunk of opened.stream) {
      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk as ArrayBufferLike);
      total += buffer.byteLength;

      if (total > this.config.maxUploadBytes) {
        opened.stream.destroy();
        throw new AppError('FILE_TOO_LARGE', {
          message: 'The stored file is too large to load into memory.',
        });
      }

      chunks.push(buffer);
    }

    return Buffer.concat(chunks);
  }

  async fileExists(
    storageKey: string | null | undefined,
    scope: StorageScope,
  ): Promise<boolean> {
    const key = normalizeKey(storageKey ?? '');

    if (key === null || !isKeyInScope(key, scope)) {
      return false;
    }

    try {
      return await this.provider.objectExists(key);
    } catch (error) {
      throw this.toAppError(error, 'read');
    }
  }

  /**
   * Delete the bytes.
   *
   * Throws when the store is reachable but refuses, so the caller can record
   * the orphan rather than lose track of it. Callers that must not fail — a
   * best-effort cleanup after a failed upload — catch it explicitly.
   */
  async deleteFile(
    storageKey: string | null | undefined,
    scope: StorageScope,
  ): Promise<void> {
    const key = normalizeKey(storageKey ?? '');

    if (key === null || !isKeyInScope(key, scope)) {
      // Ignoring an out-of-scope key is correct here: a delete is authorized by
      // the row, and a key outside the row's scope means there is nothing this
      // caller is entitled to remove.
      return;
    }

    try {
      await this.provider.deleteObject(key);
    } catch (error) {
      throw this.toAppError(error, 'delete');
    }
  }

  /**
   * A short-lived URL for one object.
   *
   * Not used by the standard download path — downloads stream through the API
   * so tenant settings and auditing keep applying — and the result must never
   * be persisted or logged.
   */
  async getSignedDownloadUrl(
    storageKey: string | null | undefined,
    scope: StorageScope,
    options: { expiresInSeconds?: number; downloadFileName?: string } = {},
  ): Promise<string> {
    const key = this.assertKeyForScope(storageKey, scope);

    try {
      return await this.provider.getSignedDownloadUrl(key, {
        // Minutes, not hours. The URL's whole safety property is that it stops
        // working quickly.
        expiresInSeconds: Math.min(
          Math.max(options.expiresInSeconds ?? 300, 30),
          900,
        ),
        downloadFileName: options.downloadFileName,
      });
    } catch (error) {
      throw this.toAppError(error, 'read');
    }
  }

  checkReadiness(): Promise<StorageReadiness> {
    return this.provider.checkReadiness();
  }

  private assertKeyForScope(
    storageKey: string | null | undefined,
    scope: StorageScope,
  ): string {
    const key = normalizeKey(storageKey ?? '');

    if (key === null) {
      throw new AppError('FILE_DOWNLOAD_FAILED', {
        message: 'The stored file could not be found.',
      });
    }

    if (!isKeyInScope(key, scope)) {
      // Reported as not-found rather than forbidden. Telling a caller that a
      // key exists but belongs to someone else confirms its existence across a
      // tenant boundary.
      this.logger.warn(
        `Refused a storage read outside the caller's scope (${scope.kind}).`,
      );
      throw new AppError('FILE_DOWNLOAD_FAILED', {
        message: 'The stored file could not be found.',
      });
    }

    return key;
  }

  private toAppError(error: unknown, operation: 'store' | 'read' | 'delete') {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof ObjectNotFoundError) {
      return new AppError('FILE_DOWNLOAD_FAILED', {
        message: 'The stored file could not be found.',
      });
    }

    if (error instanceof ObjectStorageUnavailableError) {
      return new AppError('FILE_STORAGE_UNAVAILABLE', {
        message:
          operation === 'store'
            ? 'The file could not be stored because file storage is unavailable. Nothing was saved.'
            : 'File storage is temporarily unavailable.',
      });
    }

    this.logger.error(
      `Unexpected storage ${operation} failure: ${
        error instanceof Error ? error.name : 'unknown'
      }`,
    );

    return new AppError('FILE_STORAGE_UNAVAILABLE');
  }
}
