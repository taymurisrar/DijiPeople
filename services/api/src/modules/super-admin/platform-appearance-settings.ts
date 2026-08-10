import { BadRequestException } from '@nestjs/common';

const PLATFORM_THEME_PRESETS = new Set([
  'ocean',
  'emerald',
  'violet',
  'sunset',
]);
const PLATFORM_THEME_COLOR_KEYS = [
  'primaryColor',
  'accentColor',
  'navigationColor',
  'surfaceTint',
] as const;

export function validatePlatformBranding(branding: Record<string, unknown>) {
  if (
    branding.themePreset !== undefined &&
    (typeof branding.themePreset !== 'string' ||
      !PLATFORM_THEME_PRESETS.has(branding.themePreset))
  ) {
    throw new BadRequestException('Unknown platform theme preset.');
  }

  for (const key of PLATFORM_THEME_COLOR_KEYS) {
    const value = branding[key];
    if (
      value !== undefined &&
      (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value))
    ) {
      throw new BadRequestException(
        `${key} must be a six-digit hexadecimal color.`,
      );
    }
  }
}
