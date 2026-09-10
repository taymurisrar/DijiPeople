import { createReadStream, createWriteStream } from 'fs';
import { mkdir, rm, stat } from 'fs/promises';
import { dirname, join, resolve, sep } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

import type { LocalStorageConfig } from '../storage.config';
import { normalizeKey } from '../storage-keys';
import {
  ObjectNotFoundError,
  ObjectStorageUnavailableError,
  type GetObjectResult,
  type ObjectStorageProvider,
  type PutObjectInput,
  type PutObjectResult,
  type StorageReadiness,
} from '../object-storage.types';

/**
 * Filesystem-backed object storage for local development and automated tests.
 *
 * This is not a fallback. `resolveStorageConfig` refuses to select it in
 * production, so there is no path by which a failing R2 causes a persistent
 * business document to land here and be reported as stored — which is precisely
 * the behaviour §10 and §35 forbid, and precisely what the audit found in the
 * previous implementation.
 *
 * It exists so the same `StorageService`, the same keys and the same scope
 * checks run in tests as in production, rather than tests exercising a mock and
 * proving nothing about the real code path (§47).
 */
export class LocalObjectStorageProvider implements ObjectStorageProvider {
  readonly name = 'local' as const;

  private readonly root: string;

  constructor(config: LocalStorageConfig) {
    this.root = resolve(process.cwd(), config.root);
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const absolutePath = this.resolvePath(input.key);

    try {
      await mkdir(dirname(absolutePath), { recursive: true });

      const source = Buffer.isBuffer(input.body)
        ? Readable.from(input.body)
        : input.body;

      await pipeline(source, createWriteStream(absolutePath));

      const written = await stat(absolutePath);
      return { key: input.key, size: written.size };
    } catch (error) {
      throw new ObjectStorageUnavailableError('put', error);
    }
  }

  async getObject(key: string): Promise<GetObjectResult> {
    const absolutePath = this.resolvePath(key);

    let fileStat;
    try {
      fileStat = await stat(absolutePath);
    } catch {
      throw new ObjectNotFoundError(key);
    }

    return {
      key,
      size: fileStat.size,
      // The local provider has nowhere to keep a content type. Callers use the
      // MIME recorded in the database, which is the authoritative copy in both
      // providers anyway.
      contentType: null,
      stream: createReadStream(absolutePath),
    };
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await rm(this.resolvePath(key), { force: true });
    } catch (error) {
      throw new ObjectStorageUnavailableError('delete', error);
    }
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      await stat(this.resolvePath(key));
      return true;
    } catch {
      return false;
    }
  }

  getSignedDownloadUrl(): Promise<string> {
    // Nothing can sign a URL for a local file. Returning a fake one would let a
    // flow appear to work in development and fail only in production.
    return Promise.reject(
      new ObjectStorageUnavailableError(
        'sign',
        'unsupported for local storage',
      ),
    );
  }

  async checkReadiness(): Promise<StorageReadiness> {
    const startedAt = Date.now();

    try {
      await mkdir(this.root, { recursive: true });
      return {
        provider: this.name,
        ready: true,
        detail: 'Local storage root is writable (development only).',
        latencyMs: Date.now() - startedAt,
      };
    } catch {
      return {
        provider: this.name,
        ready: false,
        detail: 'Local storage root is not writable.',
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  /**
   * Map a key to a path under the root, refusing anything that could leave it.
   *
   * `normalizeKey` has already rejected traversal, absolute paths and encoded
   * variants. The containment assertion afterwards is not redundant: it is the
   * check that still holds if the key format is ever loosened, and on Windows
   * it catches separators the key grammar does not model.
   */
  private resolvePath(key: string): string {
    const normalized = normalizeKey(key);

    if (normalized === null) {
      throw new ObjectNotFoundError(key);
    }

    const absolutePath = resolve(join(this.root, normalized));

    if (
      absolutePath !== this.root &&
      !absolutePath.startsWith(this.root + sep)
    ) {
      throw new ObjectNotFoundError(key);
    }

    return absolutePath;
  }
}
