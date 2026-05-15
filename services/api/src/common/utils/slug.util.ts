import { BadRequestException } from '@nestjs/common';

export const RESERVED_TENANT_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'auth',
  'callback',
  'cdn',
  'dashboard',
  'email',
  'smtp',
  'mail',
  'login',
  'logout',
  'oauth',
  'register',
  'settings',
  'signup',
  'assets',
  'static',
  'status',
  'health',
  'public',
  'private',
  'security',
  'sso',
  'www',
  'dijipeople',
  'tenant',
  'tenants',
  'system',
  'platform',
  'portal',
  'support',
  'help',
  'docs',
  'billing',
  'account',
  'accounts',
  'root',
  'superadmin',
]);

const TENANT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type TenantSlugValidationErrorCode =
  | 'TENANT_SLUG_REQUIRED'
  | 'TENANT_SLUG_INVALID_LENGTH'
  | 'TENANT_SLUG_INVALID_FORMAT'
  | 'TENANT_SLUG_RESERVED';

export function normalizeTenantSlug(value: string) {
  return value.trim().toLowerCase();
}

export function getReservedTenantSlugs() {
  const configured = (process.env.TENANT_SLUG_RESERVED_WORDS ?? '')
    .split(',')
    .map((value) => normalizeTenantSlug(value))
    .filter(Boolean);

  return new Set([...RESERVED_TENANT_SLUGS, ...configured]);
}

export function assertValidTenantSlug(value: string) {
  const slug = normalizeTenantSlug(value);

  if (!slug) {
    throw tenantSlugError(
      'TENANT_SLUG_REQUIRED',
      'Tenant slug is required.',
      slug,
    );
  }

  if (slug.length < 3 || slug.length > 63) {
    throw tenantSlugError(
      'TENANT_SLUG_INVALID_LENGTH',
      'Tenant slug must be between 3 and 63 characters.',
      slug,
    );
  }

  if (!TENANT_SLUG_PATTERN.test(slug)) {
    throw tenantSlugError(
      'TENANT_SLUG_INVALID_FORMAT',
      'Tenant slug must use lowercase letters, numbers, and single hyphens only. It cannot start or end with a hyphen.',
      slug,
    );
  }

  if (slug.includes('--')) {
    throw tenantSlugError(
      'TENANT_SLUG_INVALID_FORMAT',
      'Tenant slug cannot contain consecutive hyphens.',
      slug,
    );
  }

  if (getReservedTenantSlugs().has(slug)) {
    throw tenantSlugError(
      'TENANT_SLUG_RESERVED',
      'This tenant slug is reserved and cannot be used.',
      slug,
    );
  }

  return slug;
}

export function suggestTenantSlug(value: string) {
  return normalizeTenantSlug(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '');
}

function tenantSlugError(
  code: TenantSlugValidationErrorCode,
  message: string,
  slug: string,
) {
  return new BadRequestException({
    code,
    message,
    details: { slug },
  });
}
