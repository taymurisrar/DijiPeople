import { BadRequestException } from '@nestjs/common';
import {
  RESERVED_HOST_LABELS,
  isValidWorkspaceSlugFormat,
  suggestWorkspaceSlug,
} from '@repo/config';

/**
 * Reserved workspace slugs.
 *
 * Derived from the platform's reserved host labels rather than listed again
 * here: a slug becomes a hostname label, so anything the host parser refuses to
 * treat as a workspace must also be refused as a slug. Keeping two lists in
 * step by hand is how a tenant ends up owning `api.dijipeople.com`.
 */
export const RESERVED_TENANT_SLUGS = new Set<string>(RESERVED_HOST_LABELS);

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

  if (slug.length < 3 || slug.length > 50) {
    throw tenantSlugError(
      'TENANT_SLUG_INVALID_LENGTH',
      'Workspace slug must be between 3 and 50 characters.',
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
  return suggestWorkspaceSlug(value);
}

/** Format check without throwing, for "is this slug usable?" callers. */
export function isTenantSlugFormatValid(value: string) {
  return isValidWorkspaceSlugFormat(value);
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
