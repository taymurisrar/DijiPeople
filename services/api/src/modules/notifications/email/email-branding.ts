import { escapeHtmlValue } from './email-safety';

/**
 * Essential tenant branding for transactional email, on EVERY plan.
 *
 * Applied to the already-rendered message rather than baked into the stored
 * templates: those are seeded rows a tenant may have edited, and rewriting them
 * would both lose the edit and need a data migration. A frame around the result
 * brands every template, present and future, without touching its copy.
 *
 * Everything here is deliberately inert for security and delivery:
 *   - the organisation name is escaped; the logo URL is built by the server
 *     from a validated slug, never taken from tenant-controlled text;
 *   - the accent is accepted only as a #rrggbb colour with enough contrast for
 *     white button text, else the product default is used;
 *   - action links, tokens and body copy are not read or altered;
 *   - a missing logo or name degrades to a plain text header, never an error.
 *
 * Not a template designer. Advanced wording is `email-template-customization`
 * (Growth+); dropping the DijiPeople attribution is `email-white-label`
 * (Enterprise/Custom).
 */
export const DEFAULT_EMAIL_ACCENT = '#0f766e';
const BRANDED_MARKER = '<!--dp-email-branded-->';
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
/* White text on the accent must stay readable (WCAG AA for normal text). */
const MIN_CONTRAST_WITH_WHITE = 4.5;

export type EmailBrandingInput = {
  organizationName: string;
  /* Absolute https/http URL of the public logo route, or null when none. */
  logoUrl: string | null;
  accentColor: string | null;
  /* False only when the tenant is entitled to white-label email. */
  showDijiPeopleAttribution: boolean;
  /* The tenant's own footer line; honoured only when attribution is dropped. */
  customFooterText?: string | null;
};

export type BrandedEmail = { html: string; text: string | null };

function luminance(hex: string) {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

export function resolveEmailAccent(candidate: string | null | undefined) {
  const value = candidate?.trim() ?? '';
  if (!HEX_COLOR.test(value)) return DEFAULT_EMAIL_ACCENT;
  const contrast = 1.05 / (luminance(value) + 0.05);
  return contrast >= MIN_CONTRAST_WITH_WHITE
    ? value.toLowerCase()
    : DEFAULT_EMAIL_ACCENT;
}

function isHttpUrl(value: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function applyEmailBranding(
  html: string,
  text: string | null,
  input: EmailBrandingInput,
): BrandedEmail {
  // Idempotent: a message that is rendered, previewed and re-sent is branded once.
  if (html.includes(BRANDED_MARKER)) return { html, text };

  const accent = resolveEmailAccent(input.accentColor);
  const name = input.organizationName.trim();
  const safeName = escapeHtmlValue(name);

  // The product default colour is what the stock templates paint buttons and
  // rules with; swapping it is how the accent reaches them.
  const accented =
    accent === DEFAULT_EMAIL_ACCENT
      ? html
      : html.split(DEFAULT_EMAIL_ACCENT).join(accent);

  const logo = isHttpUrl(input.logoUrl)
    ? `<img src="${escapeHtmlValue(input.logoUrl as string)}" alt="${safeName}" height="40" style="display:block;max-height:40px;max-width:220px;height:auto;border:0;margin:0 0 8px;" />`
    : '';
  const nameLine = safeName
    ? `<div style="font-size:16px;line-height:24px;font-weight:bold;color:#1f2933;">${safeName}</div>`
    : '';

  const header =
    `<div style="background-color:#f5f6f8;font-family:Arial,Helvetica,sans-serif;">` +
    `<div style="max-width:560px;margin:0 auto;padding:24px 16px 0;">` +
    `<div style="border-top:4px solid ${accent};padding-top:16px;">${logo}${nameLine}</div>` +
    `</div></div>`;

  const footerLines: string[] = [];
  const footerPlain: string[] = [];
  if (name) {
    footerLines.push(`Sent on behalf of ${safeName}`);
    footerPlain.push(`Sent on behalf of ${name}`);
  }
  const customFooter = input.customFooterText?.trim() ?? '';
  if (input.showDijiPeopleAttribution) {
    footerLines.push('Powered by DijiPeople');
    footerPlain.push('Powered by DijiPeople');
  } else if (customFooter && customFooter !== 'Powered by DijiPeople') {
    footerLines.push(escapeHtmlValue(customFooter));
    footerPlain.push(customFooter);
  }

  const footer =
    footerLines.length === 0
      ? ''
      : `<div style="background-color:#f5f6f8;font-family:Arial,Helvetica,sans-serif;">` +
        `<div style="max-width:560px;margin:0 auto;padding:0 16px 24px;font-size:12px;line-height:18px;color:#52606d;text-align:center;">` +
        footerLines.join('<br />') +
        `</div></div>`;

  const brandedText =
    text === null
      ? null
      : [name, name ? '' : null, text, '', ...footerPlain]
          .filter((line): line is string => line !== null)
          .join('\n')
          .trim();

  return {
    html: `${BRANDED_MARKER}${header}${accented}${footer}`,
    text: brandedText,
  };
}
