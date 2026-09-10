import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { OBJECT_STORAGE_PROVIDER } from './object-storage.types';
import { LocalObjectStorageProvider } from './providers/local-object-storage.provider';
import { R2ObjectStorageProvider } from './providers/r2-object-storage.provider';
import {
  describeStorageConfig,
  resolveStorageConfig,
  type StorageConfig,
} from './storage.config';
import { StorageService } from './storage.service';
import { STORAGE_CONFIG } from './storage.tokens';

/**
 * Wires exactly one object-storage provider for the process.
 *
 * The provider is chosen once, at boot, from validated configuration. There is
 * no runtime switch and no fallback chain: if the configured store cannot be
 * constructed the application refuses to start rather than starting in a state
 * where uploads appear to succeed while the bytes are not durable. That refusal
 * is the mechanism keeping FILE-01 closed.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: STORAGE_CONFIG,
      useFactory: (): StorageConfig => {
        const logger = new Logger('StorageModule');
        const { config, errors, warnings } = resolveStorageConfig(process.env);

        for (const warning of warnings) {
          logger.warn(warning);
        }

        if (!config) {
          for (const error of errors) {
            logger.error(error);
          }

          // Fail closed. An API that boots without durable storage will accept
          // an employment contract and lose it, and nothing downstream can
          // detect that it happened.
          throw new Error(
            `File storage is not configured correctly: ${errors.join(' ')}`,
          );
        }

        logger.log(describeStorageConfig(config));

        if (config.provider === 'local') {
          logger.warn(
            'Using local filesystem storage. Uploaded files are NOT durable, and this provider is rejected in production.',
          );
        }

        return config;
      },
    },
    {
      provide: OBJECT_STORAGE_PROVIDER,
      inject: [STORAGE_CONFIG],
      useFactory: (config: StorageConfig) =>
        config.provider === 'r2'
          ? new R2ObjectStorageProvider(config)
          : new LocalObjectStorageProvider(config),
    },
    StorageService,
  ],
  exports: [StorageService, OBJECT_STORAGE_PROVIDER, STORAGE_CONFIG],
})
export class StorageModule {}
