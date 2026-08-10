import { BadRequestException } from '@nestjs/common';
import { validatePlatformBranding } from './platform-appearance-settings';

describe('platform appearance settings', () => {
  it('accepts a supported preset and controlled color tokens', () => {
    expect(() =>
      validatePlatformBranding({
        themePreset: 'emerald',
        primaryColor: '#047857',
        accentColor: '#10B981',
        navigationColor: '#064e3b',
        surfaceTint: '#ecfdf5',
      }),
    ).not.toThrow();
  });

  it('rejects disconnected presets and invalid CSS color values', () => {
    expect(() => validatePlatformBranding({ themePreset: 'dark' })).toThrow(
      BadRequestException,
    );
    expect(() =>
      validatePlatformBranding({ primaryColor: 'rgb(0, 0, 0)' }),
    ).toThrow('primaryColor must be a six-digit hexadecimal color.');
  });
});
