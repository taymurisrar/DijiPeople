import { DEFAULT_TENANT_SETTINGS } from './tenant-settings.catalog';

/**
 * DP-QA-013. The default accent #059669 is 3.76:1 on white, under the WCAG AA
 * minimum of 4.5:1 for normal text, and it failed axe on six screens (links,
 * eyebrow labels, white text on accent buttons and tabs). The default theme must
 * pass; a tenant that chooses its own colour owns that choice.
 */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('default branding meets WCAG AA', () => {
  const branding = DEFAULT_TENANT_SETTINGS.branding as Record<string, string>;

  it('primary colour is readable as text on the surface', () => {
    expect(
      contrast(branding.primaryColor, branding.surfaceColor),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('white text on the primary colour is readable', () => {
    expect(contrast(branding.primaryColor, '#ffffff')).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('the active sidebar item is readable', () => {
    expect(
      contrast(
        branding.sidebarActiveBackgroundColor,
        branding.sidebarActiveTextColor,
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
