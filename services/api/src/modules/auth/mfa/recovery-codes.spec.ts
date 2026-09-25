import {
  generateRecoveryCodes,
  normalizeRecoveryCode,
  RECOVERY_CODE_COUNT,
  recoveryCodeHashInput,
} from './recovery-codes';

describe('MFA recovery codes', () => {
  it('generates ten distinct codes in xxxxx-xxxxx form', () => {
    const codes = generateRecoveryCodes();

    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9a-hjkmnp-tv-z]{5}-[0-9a-hjkmnp-tv-z]{5}$/);
    }
  });

  it('never repeats a set', () => {
    expect(generateRecoveryCodes()).not.toEqual(generateRecoveryCodes());
  });

  it('normalises case, spacing, hyphens and look-alike characters', () => {
    expect(normalizeRecoveryCode('ABCDE-FGH12')).toBe('abcdefgh12');
    expect(normalizeRecoveryCode(' abcde fgh12 ')).toBe('abcdefgh12');
    expect(normalizeRecoveryCode('abcdefgh12')).toBe('abcdefgh12');
    expect(normalizeRecoveryCode('0O1lI-23456')).toBe('00111' + '23456');
  });

  it('rejects input that cannot be a recovery code', () => {
    expect(normalizeRecoveryCode('')).toBeNull();
    expect(normalizeRecoveryCode('abcd-efgh')).toBeNull();
    expect(normalizeRecoveryCode('abcde-fghuu')).toBeNull();
    expect(normalizeRecoveryCode('abcde-fgh12-x')).toBeNull();
  });

  it('binds the hash input to the owning account', () => {
    expect(recoveryCodeHashInput('user-a', 'abcdefgh12')).not.toBe(
      recoveryCodeHashInput('user-b', 'abcdefgh12'),
    );
  });
});
