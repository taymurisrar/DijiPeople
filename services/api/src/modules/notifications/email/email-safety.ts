import { BadRequestException } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';
import { toDisplayString } from '../../../common/utils/display-string';

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

/*
 * ITEM-0181. What a tenant may store as an email body.
 *
 * `sanitizeHtmlTemplate` above only refuses `<script>` and `javascript:` links,
 * which was enough while the only author was someone pasting HTML they wrote.
 * The visual editor produces markup from a browser's editing surface, and a
 * paste into it can carry anything the clipboard held — iframes, forms, event
 * handler attributes. The allowlist is what an email body needs and nothing
 * more; the editor is not trusted to have produced only that.
 *
 * `style` is kept on every element because email clients ignore stylesheets
 * and inline styles are the only styling that survives. `{{token}}` hrefs have
 * no scheme and pass as relative URLs; the scheme check applies to what they
 * render into, and the rendered output is checked again at send time.
 */
const EMAIL_TEMPLATE_ALLOWED_TAGS = [
  'a',
  'b',
  'blockquote',
  'br',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'hr',
  'i',
  'li',
  'ol',
  'p',
  's',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
];

const UNSAFE_STYLE_PATTERN = /expression\s*\(|javascript:|url\s*\(/i;

export function sanitizeEmailTemplateHtml(htmlTemplate: string) {
  const cleaned = sanitizeHtml(htmlTemplate, {
    allowedTags: EMAIL_TEMPLATE_ALLOWED_TAGS,
    allowedAttributes: {
      '*': ['style'],
      a: ['href', 'target', 'rel', 'style'],
      table: ['role', 'width', 'cellpadding', 'cellspacing', 'border', 'style'],
      td: ['align', 'valign', 'width', 'colspan', 'style'],
      th: ['align', 'valign', 'width', 'colspan', 'style'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href'],
    allowProtocolRelative: false,
  }).trim();

  assertSafeHtmlTemplate(cleaned);
  if (UNSAFE_STYLE_PATTERN.test(cleaned)) {
    throw new BadRequestException(
      'Email templates cannot include script expressions or external resources in styles.',
    );
  }

  return cleaned;
}

export function escapeHtmlValue(value: unknown) {
  return toDisplayString(value ?? '')
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

export function redactEmailError(value: unknown) {
  const message = value instanceof Error ? value.message : String(value);
  return message
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[redacted]@')
    .replace(
      /(password|secret|token|api[_-]?key|client[_-]?secret)\s*[=:]\s*[^\s,;]+/gi,
      '$1=[redacted]',
    )
    .slice(0, 1000);
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
