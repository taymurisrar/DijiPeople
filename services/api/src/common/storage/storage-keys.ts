import { randomUUID } from 'crypto';
import { extname } from 'path';

import type { StorageScope } from './object-storage.types';

/**
 * Object keys are built here and nowhere else.
 *
 * Before this module, every call site concatenated its own `subdirectory`
 * string, which is how contract documents and support-case attachments — both
 * tenant-owned — ended up in a flat namespace with no tenant partition at all
 * (FILE-15), and why the FILE-03 remediation had nothing structural to check a
 * key against. One builder means the tenant prefix is a property of the key
 * format rather than of each caller remembering it.
 *
 * Layout:
 *
 *   tenants/{tenantId}/{domain}/{...segments}/{yyyy}/{mm}/{uuid}{.ext}
 *   platform/{domain}/{...segments}/{yyyy}/{mm}/{uuid}{.ext}
 *
 * The date segments are for operational legibility — listing a prefix to answer
 * "what did this tenant upload in March" should not require a full scan. They
 * carry no authorization meaning.
 */
export const TENANT_KEY_ROOT = 'tenants';
export const PLATFORM_KEY_ROOT = 'platform';

/**
 * Domains are a closed set. An open string would let a caller invent
 * `../../platform` by another name, and it would let two modules disagree about
 * where the same kind of file lives.
 */
export const STORAGE_DOMAINS = [
  'documents',
  'employees',
  'payslips',
  'payroll',
  'recruitment',
  'contracts',
  'support-cases',
  'branding',
  'data-exports',
  'data-imports',
  'report-exports',
  'dlp-captures',
  'invoices',
  'app-releases',
  'platform-communications',
] as const;

export type StorageDomain = (typeof STORAGE_DOMAINS)[number];

/**
 * Extensions we are willing to put on an object key. The extension is cosmetic
 * — content type comes from validated metadata, never from the key — but an
 * unbounded one lets a filename drive the key, which §12 forbids.
 */
const SAFE_EXTENSION = /^[a-z0-9]{1,12}$/;

export interface BuildObjectKeyInput {
  readonly scope: StorageScope;
  readonly domain: StorageDomain;
  /**
   * Opaque identifiers only — an entity id, a document id, a release channel.
   * Never a person's name, email, national id, filename or any other PII (§12,
   * §31). Anything that is not `[A-Za-z0-9._-]` is rejected rather than
   * silently rewritten, so a caller cannot believe it partitioned by something
   * it did not.
   */
  readonly segments?: readonly string[];
  /** Used only to derive a safe extension. The original name lives in the database. */
  readonly originalFileName?: string | null;
  /** Overrides any extension derived from `originalFileName`. */
  readonly extension?: string | null;
}

export function buildObjectKey(input: BuildObjectKeyInput): string {
  const prefix = scopePrefix(input.scope);

  if (!STORAGE_DOMAINS.includes(input.domain)) {
    throw new Error(`Unknown storage domain: ${input.domain}`);
  }

  const segments = (input.segments ?? []).map(assertOpaqueSegment);

  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');

  const extension = resolveExtension(input.extension, input.originalFileName);
  const objectId = `${randomUUID()}${extension}`;

  return [prefix, input.domain, ...segments, year, month, objectId].join('/');
}

/**
 * The prefix every key in a given scope must start with.
 *
 * `tenantId` is asserted rather than sanitised: it comes from
 * `request.user.tenantId`, so a value that is not a plain identifier means the
 * authenticated context itself is wrong, and quietly rewriting it would put the
 * object in a namespace nobody intended.
 */
export function scopePrefix(scope: StorageScope): string {
  if (scope.kind === 'platform') {
    return PLATFORM_KEY_ROOT;
  }

  return `${TENANT_KEY_ROOT}/${assertOpaqueSegment(scope.tenantId)}`;
}

/**
 * True when `key` lies inside `scope`.
 *
 * This is defence in depth, not the primary control. The primary control is
 * that a storage key is never client input any more: it is read from a row that
 * was already fetched under a `tenantId` filter. This check is what catches the
 * case where that discipline slips — and it is what makes a leaked key from
 * FILE-18 useless against another tenant.
 */
export function isKeyInScope(key: string, scope: StorageScope): boolean {
  const normalized = normalizeKey(key);
  if (normalized === null) {
    return false;
  }

  const prefix = scopePrefix(scope);

  if (scope.kind === 'platform') {
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  }

  // A tenant may not reach the platform namespace, and — the point of the whole
  // exercise — may not reach another tenant's, whose prefix differs from the
  // first path segment after `tenants/`.
  return normalized.startsWith(`${prefix}/`);
}

/**
 * Rejects anything that is not a plain, forward-slash-separated relative key.
 *
 * Returns `null` rather than throwing so callers can decide between a 404 and a
 * 400. Absolute URLs are refused here, which closes FILE-17: a candidate
 * document whose `storageKey` was an `https://` value used to become an
 * authenticated open redirect.
 */
export function normalizeKey(key: string): string | null {
  if (typeof key !== 'string') {
    return null;
  }

  const trimmed = key.trim();

  if (trimmed.length === 0 || trimmed.length > 1024) {
    return null;
  }

  // Absolute URLs, protocol-relative URLs, Windows drive paths, UNC paths.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) || trimmed.startsWith('//')) {
    return null;
  }

  // Backslashes are not a separator here. Accepting them would mean two keys
  // could normalize to the same object on one platform and not on another.
  if (trimmed.includes('\\') || trimmed.startsWith('/')) {
    return null;
  }

  // Percent-encoding is decoded before the traversal check, so `%2e%2e%2f`
  // cannot smuggle a `../` past it.
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return null;
  }

  if (decoded.includes('\0') || decoded.includes('\\')) {
    return null;
  }

  const segments = decoded.split('/');
  if (
    segments.some(
      (segment) => segment === '' || segment === '.' || segment === '..',
    )
  ) {
    return null;
  }

  return segments.join('/');
}

function assertOpaqueSegment(value: string): string {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)
  ) {
    throw new Error(
      'Storage key segments must be opaque identifiers. Filenames and free text are not accepted.',
    );
  }

  if (value.includes('..')) {
    throw new Error('Storage key segments may not contain "..".');
  }

  return value;
}

function resolveExtension(
  explicit: string | null | undefined,
  originalFileName: string | null | undefined,
): string {
  const candidate = (
    explicit ?? (originalFileName ? extname(originalFileName) : '')
  )
    .replace(/^\./, '')
    .toLowerCase();

  return SAFE_EXTENSION.test(candidate) ? `.${candidate}` : '';
}
