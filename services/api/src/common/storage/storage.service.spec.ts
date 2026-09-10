/*
 * Several assertions reference mocked provider methods by name
 * (`expect(provider.getObject).not.toHaveBeenCalled()`), which makes
 * `unbound-method` fire even though jest never calls them detached. Disabling
 * the rule for this spec follows the same pattern as `dlp.service.spec.ts` and
 * keeps the provider mock strongly typed rather than cast to `any` — which
 * matters here, because these are the assertions that prove a cross-tenant read
 * never reaches the store at all.
 */
/* eslint-disable @typescript-eslint/unbound-method */
import { readdirSync } from 'fs';
import { mkdtemp, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';

import { AppError } from '../errors/app-error';
import {
  ObjectNotFoundError,
  ObjectStorageUnavailableError,
  type ObjectStorageProvider,
  type StorageScope,
} from './object-storage.types';
import { LocalObjectStorageProvider } from './providers/local-object-storage.provider';
import { StorageService } from './storage.service';
import type { StorageConfig } from './storage.config';

const TENANT_A: StorageScope = { kind: 'tenant', tenantId: 'tenant-aaa' };
const TENANT_B: StorageScope = { kind: 'tenant', tenantId: 'tenant-bbb' };
const PLATFORM: StorageScope = { kind: 'platform' };

const CONFIG: StorageConfig = {
  provider: 'r2',
  bucket: 'test-bucket',
  endpoint: 'https://example.r2.cloudflarestorage.com',
  region: 'auto',
  accessKeyId: 'x'.repeat(32),
  secretAccessKey: 'y'.repeat(64),
  requestTimeoutMs: 5_000,
  maxAttempts: 2,
  maxUploadBytes: 1024,
};

function fakeProvider(overrides: Partial<ObjectStorageProvider> = {}) {
  const stored = new Map<string, Buffer>();

  const provider: ObjectStorageProvider = {
    name: 'r2',
    putObject: jest.fn(async (input) => {
      stored.set(
        input.key,
        Buffer.isBuffer(input.body) ? input.body : Buffer.alloc(0),
      );
      return { key: input.key, size: input.contentLength };
    }),
    getObject: jest.fn(async (key: string) => {
      const bytes = stored.get(key);
      if (!bytes) throw new ObjectNotFoundError(key);
      return {
        key,
        size: bytes.byteLength,
        contentType: null,
        stream: Readable.from(bytes),
      };
    }),
    deleteObject: jest.fn(async (key: string) => {
      stored.delete(key);
    }),
    objectExists: jest.fn(async (key: string) => stored.has(key)),
    getSignedDownloadUrl: jest.fn(async () => 'https://signed.example/object'),
    checkReadiness: jest.fn(async () => ({
      provider: 'r2' as const,
      ready: true,
      detail: 'ok',
      latencyMs: 1,
    })),
    ...overrides,
  };

  return { provider, stored };
}

function service(overrides: Partial<ObjectStorageProvider> = {}) {
  const { provider, stored } = fakeProvider(overrides);
  return { svc: new StorageService(provider, CONFIG), provider, stored };
}

describe('StorageService', () => {
  describe('storage failure behaviour', () => {
    /**
     * The single most important test in this module.
     *
     * The defect being remediated was an upload that reported success while the
     * bytes went somewhere that would not survive the next deploy. The rule now
     * is that a storage failure is a failure: the caller must not receive a
     * result it could persist as a working document reference.
     */
    it('fails the upload when the object store is unavailable', async () => {
      const { svc } = service({
        putObject: jest.fn(async () => {
          throw new ObjectStorageUnavailableError('put');
        }),
      });

      const error = await svc
        .saveFile({
          buffer: Buffer.from('an employment contract'),
          originalFileName: 'contract.pdf',
          contentType: 'application/pdf',
          scope: TENANT_A,
          domain: 'documents',
        })
        .catch((e) => e);

      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).errorCode).toBe('FILE_STORAGE_UNAVAILABLE');
      expect((error as AppError).statusCode).toBe(503);
      expect((error as AppError).message).toMatch(/nothing was saved/i);
    });

    it('never writes to the filesystem when the object store fails', async () => {
      // The specific regression guarded here: "R2 failed, so put it on disk and
      // report success". Nothing in this module may touch the filesystem, so a
      // failed upload leaves the working directory untouched.
      const before = readdirSync(process.cwd()).sort();

      const { svc } = service({
        putObject: jest.fn(async () => {
          throw new ObjectStorageUnavailableError('put');
        }),
      });

      await expect(
        svc.saveFile({
          buffer: Buffer.from('payload'),
          originalFileName: 'x.pdf',
          contentType: 'application/pdf',
          scope: TENANT_A,
          domain: 'documents',
        }),
      ).rejects.toBeInstanceOf(AppError);

      expect(readdirSync(process.cwd()).sort()).toEqual(before);
    });

    it('distinguishes an outage from a missing object on read', async () => {
      const { svc: unavailable } = service({
        getObject: jest.fn(async () => {
          throw new ObjectStorageUnavailableError('get');
        }),
      });

      const outage = await unavailable
        .openFile('tenants/tenant-aaa/documents/2026/09/x.pdf', TENANT_A)
        .catch((e: AppError) => e);
      expect(outage.errorCode).toBe('FILE_STORAGE_UNAVAILABLE');

      const { svc: empty } = service();
      const missing = await empty
        .openFile('tenants/tenant-aaa/documents/2026/09/x.pdf', TENANT_A)
        .catch((e: AppError) => e);
      // A 404 and a 503 send an operator down opposite paths: "the document is
      // gone" versus "the store is down and every document is affected".
      expect(missing.errorCode).toBe('FILE_DOWNLOAD_FAILED');
    });

    it('surfaces an outage rather than reporting an object as absent', async () => {
      const { svc } = service({
        objectExists: jest.fn(async () => {
          throw new ObjectStorageUnavailableError('exists');
        }),
      });

      // Returning false here would let a reconciliation pass conclude that every
      // live document is an orphan.
      await expect(
        svc.fileExists('tenants/tenant-aaa/documents/2026/09/x.pdf', TENANT_A),
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('cross-tenant access', () => {
    it("refuses to read another tenant's object and never calls the provider", async () => {
      const { svc, provider } = service();

      const saved = await svc.saveFile({
        buffer: Buffer.from('tenant b payslip'),
        originalFileName: 'payslip.pdf',
        contentType: 'application/pdf',
        scope: TENANT_B,
        domain: 'payslips',
      });

      const error = await svc
        .openFile(saved.storageKey, TENANT_A)
        .catch((e: AppError) => e);

      expect(error.errorCode).toBe('FILE_DOWNLOAD_FAILED');
      // Reported as not-found rather than forbidden: a 403 would confirm to
      // tenant A that the object exists.
      expect(error.statusCode).toBe(404);
      expect(provider.getObject).not.toHaveBeenCalledWith(saved.storageKey);
    });

    it("refuses to delete another tenant's object", async () => {
      const { svc, provider, stored } = service();

      const saved = await svc.saveFile({
        buffer: Buffer.from('tenant b contract'),
        originalFileName: 'contract.pdf',
        contentType: 'application/pdf',
        scope: TENANT_B,
        domain: 'contracts',
      });

      await svc.deleteFile(saved.storageKey, TENANT_A);

      expect(provider.deleteObject).not.toHaveBeenCalled();
      expect(stored.has(saved.storageKey)).toBe(true);
    });

    it('refuses a tenant caller reaching into the platform namespace', async () => {
      const { svc } = service();

      const saved = await svc.saveFile({
        buffer: Buffer.from('installer'),
        originalFileName: 'agent.exe',
        contentType: 'application/octet-stream',
        scope: PLATFORM,
        domain: 'app-releases',
      });

      await expect(svc.openFile(saved.storageKey, TENANT_A)).rejects.toThrow();
    });

    it('reports a cross-tenant object as absent rather than existing', async () => {
      const { svc } = service();
      const saved = await svc.saveFile({
        buffer: Buffer.from('x'),
        originalFileName: 'x.pdf',
        contentType: 'application/pdf',
        scope: TENANT_B,
        domain: 'documents',
      });

      expect(await svc.fileExists(saved.storageKey, TENANT_A)).toBe(false);
      expect(await svc.fileExists(saved.storageKey, TENANT_B)).toBe(true);
    });
  });

  describe('size and content limits', () => {
    it('refuses a buffer over the configured maximum', async () => {
      const { svc, provider } = service();

      const error = await svc
        .saveFile({
          buffer: Buffer.alloc(CONFIG.maxUploadBytes + 1),
          originalFileName: 'big.bin',
          contentType: 'application/octet-stream',
          scope: TENANT_A,
          domain: 'documents',
        })
        .catch((e: AppError) => e);

      expect(error.errorCode).toBe('FILE_TOO_LARGE');
      expect(provider.putObject).not.toHaveBeenCalled();
    });

    it('refuses an empty upload', async () => {
      const { svc } = service();

      await expect(
        svc.saveFile({
          buffer: Buffer.alloc(0),
          originalFileName: 'empty.pdf',
          contentType: 'application/pdf',
          scope: TENANT_A,
          domain: 'documents',
        }),
      ).rejects.toBeInstanceOf(AppError);
    });

    it('bounds readFileBuffer so a large object cannot be pulled into the heap', async () => {
      const oversized = Buffer.alloc(CONFIG.maxUploadBytes + 10);
      const { svc } = service({
        getObject: jest.fn(async (key: string) => ({
          key,
          size: oversized.byteLength,
          contentType: null,
          stream: Readable.from(oversized),
        })),
      });

      await expect(
        svc.readFileBuffer(
          'tenants/tenant-aaa/documents/2026/09/x.bin',
          TENANT_A,
        ),
      ).rejects.toMatchObject({ errorCode: 'FILE_TOO_LARGE' });
    });
  });

  describe('recorded metadata', () => {
    it('returns a checksum of exactly the bytes that were stored', async () => {
      const { svc } = service();
      const payload = Buffer.from('the quick brown fox');

      const saved = await svc.saveFile({
        buffer: payload,
        originalFileName: 'x.txt',
        contentType: 'text/plain',
        scope: TENANT_A,
        domain: 'documents',
      });

      const { createHash } = await import('crypto');
      expect(saved.checksumSha256).toBe(
        createHash('sha256').update(payload).digest('hex'),
      );
      expect(saved.storageProvider).toBe('r2');
    });

    it('bounds a signed URL to minutes', async () => {
      const { svc, provider } = service();
      const saved = await svc.saveFile({
        buffer: Buffer.from('x'),
        originalFileName: 'x.pdf',
        contentType: 'application/pdf',
        scope: TENANT_A,
        domain: 'documents',
      });

      await svc.getSignedDownloadUrl(saved.storageKey, TENANT_A, {
        expiresInSeconds: 60 * 60 * 24 * 7,
      });

      const [, options] = (provider.getSignedDownloadUrl as jest.Mock).mock
        .calls[0];
      // A week-long URL is a permanent public link in practice.
      expect(options.expiresInSeconds).toBeLessThanOrEqual(900);
    });
  });
});

describe('LocalObjectStorageProvider', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'dp-storage-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('contains a traversal key inside the root', async () => {
    const provider = new LocalObjectStorageProvider({
      provider: 'local',
      root,
      maxUploadBytes: 1024,
    });

    await expect(
      provider.putObject({
        key: '../../escaped.txt',
        body: Buffer.from('x'),
        contentType: 'text/plain',
        contentLength: 1,
      }),
    ).rejects.toThrow();

    // Nothing escaped, and nothing was created inside the root either.
    expect(await readdir(root)).toHaveLength(0);
  });

  it('refuses to sign a URL rather than returning a fake one', async () => {
    const provider = new LocalObjectStorageProvider({
      provider: 'local',
      root,
      maxUploadBytes: 1024,
    });

    // A plausible-looking fake would let a signed-URL flow appear to work in
    // development and fail only in production.
    await expect(provider.getSignedDownloadUrl()).rejects.toBeInstanceOf(
      ObjectStorageUnavailableError,
    );
  });
});
