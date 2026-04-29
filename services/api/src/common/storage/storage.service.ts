import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'fs';
import { mkdir, rm, stat, writeFile } from 'fs/promises';
import { basename, dirname, extname, join, normalize, resolve } from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class StorageService {
  constructor(private readonly configService: ConfigService) {}

  getMaxUploadBytes() {
    return Number(
      this.configService.get('FILE_UPLOAD_MAX_BYTES') ?? 10_485_760,
    );
  }

  getStorageRoot() {
    return resolve(
      process.cwd(),
      this.configService.get('FILE_STORAGE_DIR') ?? 'storage/uploads',
    );
  }

  async saveFile(input: {
    buffer: Buffer;
    originalFileName: string;
    subdirectory: string;
  }) {
    const safeDirectory = sanitizePathSegment(input.subdirectory);
    const safeFileName = sanitizeFileName(input.originalFileName);
    const extension = extname(safeFileName);
    const storageKey = join(
      safeDirectory,
      `${new Date().toISOString().slice(0, 10)}-${randomUUID()}${extension}`,
    ).replace(/\\/g, '/');
    const absolutePath = this.resolveStoragePath(storageKey);

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.buffer);

    return {
      storageKey,
      absolutePath,
      size: input.buffer.byteLength,
    };
  }

  async openFile(storageKey: string) {
    const absolutePath = this.resolveStoragePath(storageKey);

    try {
      const fileStat = await stat(absolutePath);

      return {
        absolutePath,
        size: fileStat.size,
        stream: createReadStream(absolutePath),
      };
    } catch {
      throw new NotFoundException('Stored file could not be found.');
    }
  }

  async deleteFile(storageKey: string | null | undefined) {
    if (!storageKey) {
      return;
    }

    const absolutePath = this.resolveStoragePath(storageKey);
    await rm(absolutePath, { force: true });
  }

  private resolveStoragePath(storageKey: string) {
    const normalizedKey = normalize(storageKey).replace(
      /^(\.\.(\/|\\|$))+/,
      '',
    );
    return join(this.getStorageRoot(), normalizedKey);
  }
}

function sanitizeFileName(fileName: string) {
  const base = basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '-');
  return base.length > 0 ? base : `file-${randomUUID()}`;
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9/_-]/g, '-');
}
