import { BadRequestException } from '@nestjs/common';

export const RESERVED_TENANT_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'auth',
  'dashboard',
  'login',
  'logout',
  'settings',
  'signup',
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

export function normalizeTenantSlug(value: string) {
  return value.trim().toLowerCase();
}

export function assertValidTenantSlug(value: string) {
  const slug = normalizeTenantSlug(value);

  if (!slug) {
    throw new BadRequestException('Tenant slug is required.');
  }

  if (slug.length < 3 || slug.length > 63) {
    throw new BadRequestException(
      'Tenant slug must be between 3 and 63 characters.',
    );
  }

  if (!TENANT_SLUG_PATTERN.test(slug)) {
    throw new BadRequestException(
      'Tenant slug must use lowercase letters, numbers, and single hyphens only. It cannot start or end with a hyphen.',
    );
  }

  if (slug.includes('--')) {
    throw new BadRequestException(
      'Tenant slug cannot contain consecutive hyphens.',
    );
  }

  if (RESERVED_TENANT_SLUGS.has(slug)) {
    throw new BadRequestException('This tenant slug is reserved.');
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
