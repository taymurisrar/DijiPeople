import { BadRequestException } from '@nestjs/common';

export const SECRET_KEY_PATTERN =
  /(password|secret|token|api[_-]?key|private[_-]?key|access[_-]?key|client[_-]?secret)/i;

const SCRIPT_TAG_PATTERN = /<\s*script\b/i;
const JAVASCRIPT_LINK_PATTERN =
  /\b(?:href|src|xlink:href)\s*=\s*(['"])\s*javascript:/i;

export function assertSafeHtmlTemplate(htmlTemplate: string) {
  if (!htmlTemplate.trim()) {
    throw new BadRequestException('Email HTML template cannot be empty.');
  }

  if (SCRIPT_TAG_PATTERN.test(htmlTemplate)) {
    throw new BadRequestException(
      'Email HTML templates cannot include script tags.',
    );
  }

  if (JAVASCRIPT_LINK_PATTERN.test(htmlTemplate)) {
    throw new BadRequestException(
      'Email HTML templates cannot include javascript: links.',
    );
  }
}

export function sanitizeHtmlTemplate(htmlTemplate: string) {
  const trimmed = htmlTemplate.trim();
  assertSafeHtmlTemplate(trimmed);
  return trimmed;
}

export function escapeHtmlValue(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function maskSensitiveConfiguration(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(maskSensitiveConfiguration);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.entries(value as Record<string, unknown>).reduce<
    Record<string, unknown>
  >((masked, [key, entryValue]) => {
    masked[key] = SECRET_KEY_PATTERN.test(key)
      ? '********'
      : maskSensitiveConfiguration(entryValue);
    return masked;
  }, {});
}

export function mergeConfigurationPreservingMaskedSecrets(
  existing: unknown,
  next: Record<string, unknown>,
) {
  const existingRecord =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};

  return Object.entries(next).reduce<Record<string, unknown>>(
    (merged, [key, value]) => {
      if (SECRET_KEY_PATTERN.test(key) && value === '********') {
        merged[key] = existingRecord[key];
        return merged;
      }

      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        existingRecord[key] &&
        typeof existingRecord[key] === 'object' &&
        !Array.isArray(existingRecord[key])
      ) {
        merged[key] = mergeConfigurationPreservingMaskedSecrets(
          existingRecord[key],
          value as Record<string, unknown>,
        );
        return merged;
      }

      merged[key] = value;
      return merged;
    },
    { ...existingRecord },
  );
}
