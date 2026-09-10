import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Logger } from '@nestjs/common';
import type { Readable } from 'stream';

import type { R2StorageConfig } from '../storage.config';
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
 * Cloudflare R2 through its S3-compatible API.
 *
 * Everything Cloudflare-specific is contained here. `StorageService` and every
 * business module above it deal only in keys, scopes and streams, so replacing
 * this class with an S3, Azure or sovereign-region provider is a wiring change
 * in `StorageModule` rather than a rewrite of document logic (§9, §39).
 */
export class R2ObjectStorageProvider implements ObjectStorageProvider {
  readonly name = 'r2' as const;

  private readonly logger = new Logger(R2ObjectStorageProvider.name);
  private readonly client: S3Client;

  constructor(private readonly config: R2StorageConfig) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      // R2 requires path-style addressing; virtual-host style resolves to a
      // hostname that does not exist for the account's bucket.
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // Bounded, and bounded on both halves. Without these an unreachable R2
      // holds an Express worker open until the client gives up, which turns a
      // storage incident into an API-wide outage (§34).
      maxAttempts: config.maxAttempts,
      requestHandler: {
        requestTimeout: config.requestTimeoutMs,
        connectionTimeout: Math.min(config.requestTimeoutMs, 5_000),
      },
    });
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          ContentLength: input.contentLength,
        }),
      );

      return { key: input.key, size: input.contentLength };
    } catch (error) {
      throw this.wrap('put', error);
    }
  }

  async getObject(key: string): Promise<GetObjectResult> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );

      if (!response.Body) {
        throw new ObjectNotFoundError(key);
      }

      return {
        key,
        size: Number(response.ContentLength ?? 0),
        contentType: response.ContentType ?? null,
        // Streamed, not buffered. A 200 MB installer must not pass through the
        // API heap on its way to the client (§19).
        stream: response.Body as Readable,
      };
    } catch (error) {
      if (isNotFound(error)) {
        throw new ObjectNotFoundError(key);
      }
      throw this.wrap('get', error);
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
    } catch (error) {
      // S3 delete is idempotent and returns success for an absent key, so a
      // not-found here means something else went wrong and the caller needs to
      // know the bytes may still exist (§27).
      if (isNotFound(error)) {
        return;
      }
      throw this.wrap('delete', error);
    }
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      return true;
    } catch (error) {
      if (isNotFound(error)) {
        return false;
      }
      // Deliberately not `false`. Reporting "absent" when the store is
      // unreachable is how a reconciliation job would decide a live document is
      // an orphan and a cleanup pass would delete its row.
      throw this.wrap('exists', error);
    }
  }

  async getSignedDownloadUrl(
    key: string,
    options: { expiresInSeconds: number; downloadFileName?: string },
  ): Promise<string> {
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          ...(options.downloadFileName
            ? {
                ResponseContentDisposition: `attachment; filename="${options.downloadFileName}"`,
              }
            : {}),
        }),
        { expiresIn: options.expiresInSeconds },
      );
    } catch (error) {
      throw this.wrap('sign', error);
    }
  }

  async checkReadiness(): Promise<StorageReadiness> {
    const startedAt = Date.now();

    try {
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.config.bucket }),
      );

      return {
        provider: this.name,
        ready: true,
        detail: 'Object storage reachable.',
        latencyMs: Date.now() - startedAt,
      };
    } catch {
      return {
        provider: this.name,
        ready: false,
        // No bucket name, no endpoint, no SDK message — a readiness probe is
        // often the least authenticated surface on the service (§36).
        detail: 'Object storage is not reachable.',
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  /**
   * Turn an SDK error into our own, logging only what is safe.
   *
   * The raw error carries the bucket, the endpoint, and sometimes a signed URL
   * fragment. None of that may reach a client response or an error-log row
   * (§23, §33), so the message is dropped and only the error's class name and
   * HTTP status survive.
   */
  private wrap(
    operation: 'put' | 'get' | 'delete' | 'exists' | 'sign' | 'ready',
    error: unknown,
  ): ObjectStorageUnavailableError {
    const name = error instanceof Error ? error.name : 'UnknownError';
    const status =
      typeof (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
        ?.httpStatusCode === 'number'
        ? (error as { $metadata: { httpStatusCode: number } }).$metadata
            .httpStatusCode
        : 'unknown';

    this.logger.error(
      `Object storage ${operation} failed (${name}, http ${status}).`,
    );

    return new ObjectStorageUnavailableError(operation);
  }
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const name = (error as { name?: string }).name;
  if (name === 'NoSuchKey' || name === 'NotFound') {
    return true;
  }

  const status = (error as { $metadata?: { httpStatusCode?: number } })
    ?.$metadata?.httpStatusCode;

  return status === 404;
}
