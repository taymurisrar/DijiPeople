import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

@Injectable()
export class PublicTenantCacheService {
  private static readonly sharedCache = new Map<string, CacheEntry<unknown>>();

  constructor(private readonly configService: ConfigService) {}

  get<T>(key: string): T | null {
    const entry = PublicTenantCacheService.sharedCache.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      PublicTenantCacheService.sharedCache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  set<T>(key: string, value: T) {
    PublicTenantCacheService.sharedCache.set(key, {
      value,
      expiresAt: Date.now() + this.getTtlMs(),
    });
  }

  delete(key: string) {
    PublicTenantCacheService.sharedCache.delete(key);
  }

  deleteByPrefix(prefix: string) {
    for (const key of PublicTenantCacheService.sharedCache.keys()) {
      if (key.startsWith(prefix)) {
        PublicTenantCacheService.sharedCache.delete(key);
      }
    }
  }

  private getTtlMs() {
    const seconds = Number(
      this.configService.get('PUBLIC_TENANT_RESOLVE_CACHE_TTL_SECONDS') ?? 300,
    );

    return (Number.isFinite(seconds) && seconds > 0 ? seconds : 300) * 1000;
  }
}
