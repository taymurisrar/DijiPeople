import {
  base32Decode,
  base32Encode,
  buildOtpauthUri,
  formatManualEntryKey,
  generateTotpSecret,
  hotp,
  TOTP_PERIOD_SECONDS,
  totpAt,
  totpTimeStep,
  verifyTotp,
} from './totp';

/*
 * ADR-0019 pins the algorithm to the published test vectors. A TOTP
 * implementation that is subtly wrong still produces six plausible digits — it
 * simply never agrees with the person's phone — so the only proof that it is
 * right is agreement with the RFCs' own tables.
 */
const RFC_SECRET_ASCII = '12345678901234567890';
const RFC_SECRET_BASE32 = base32Encode(Buffer.from(RFC_SECRET_ASCII, 'ascii'));

describe('TOTP (RFC 4226 / RFC 6238)', () => {
  it('matches the RFC 4226 Appendix D HOTP test values', () => {
    const expected = [
      '755224',
      '287082',
      '359152',
      '969429',
      '338314',
      '254676',
      '287922',
      '162583',
      '399871',
      '520489',
    ];
    const secret = Buffer.from(RFC_SECRET_ASCII, 'ascii');

    expected.forEach((value, counter) => {
      expect(hotp(secret, counter)).toBe(value);
    });
  });

  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('matches the RFC 6238 Appendix B SHA1 value at T=%i', (seconds, value) => {
    expect(totpAt(RFC_SECRET_BASE32, seconds * 1000, 8)).toBe(value);
  });

  it('round-trips base32 and tolerates hand-typed spacing and case', () => {
    const bytes = Buffer.from('any random bytes!');
    const encoded = base32Encode(bytes);

    expect(base32Decode(encoded)).toEqual(bytes);
    expect(base32Decode(formatManualEntryKey(encoded).toLowerCase())).toEqual(
      bytes,
    );
    expect(RFC_SECRET_BASE32).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(() => base32Decode('not base32!')).toThrow();
  });

  it('generates 160-bit secrets that differ each time', () => {
    const first = generateTotpSecret();
    const second = generateTotpSecret();

    expect(base32Decode(first)).toHaveLength(20);
    expect(first).not.toBe(second);
  });

  describe('verifyTotp', () => {
    const now = 1_700_000_000_000;
    const step = totpTimeStep(now);
    const codeAt = (offsetSteps: number) =>
      totpAt(RFC_SECRET_BASE32, now + offsetSteps * TOTP_PERIOD_SECONDS * 1000);

    it('accepts the current code and returns its step', () => {
      expect(verifyTotp(RFC_SECRET_BASE32, codeAt(0), { nowMs: now })).toEqual({
        valid: true,
        step,
      });
    });

    it('accepts one step either side for clock drift, and no further', () => {
      expect(verifyTotp(RFC_SECRET_BASE32, codeAt(-1), { nowMs: now })).toEqual(
        { valid: true, step: step - 1 },
      );
      expect(verifyTotp(RFC_SECRET_BASE32, codeAt(1), { nowMs: now })).toEqual({
        valid: true,
        step: step + 1,
      });
      expect(verifyTotp(RFC_SECRET_BASE32, codeAt(-2), { nowMs: now })).toEqual(
        { valid: false, reason: 'INVALID' },
      );
      expect(verifyTotp(RFC_SECRET_BASE32, codeAt(2), { nowMs: now })).toEqual({
        valid: false,
        reason: 'INVALID',
      });
    });

    it('refuses an expired code from several minutes ago', () => {
      expect(
        verifyTotp(RFC_SECRET_BASE32, codeAt(-10), { nowMs: now }).valid,
      ).toBe(false);
    });

    it('refuses a replay of the last accepted step and anything earlier', () => {
      expect(
        verifyTotp(RFC_SECRET_BASE32, codeAt(0), {
          nowMs: now,
          lastUsedStep: BigInt(step),
        }),
      ).toEqual({ valid: false, reason: 'REPLAYED' });
      expect(
        verifyTotp(RFC_SECRET_BASE32, codeAt(-1), {
          nowMs: now,
          lastUsedStep: step,
        }),
      ).toEqual({ valid: false, reason: 'REPLAYED' });
      expect(
        verifyTotp(RFC_SECRET_BASE32, codeAt(1), {
          nowMs: now,
          lastUsedStep: step,
        }),
      ).toEqual({ valid: true, step: step + 1 });
    });

    it('refuses a wrong code and malformed input', () => {
      const wrong = String((Number(codeAt(0)) + 1) % 1_000_000).padStart(
        6,
        '0',
      );
      expect(verifyTotp(RFC_SECRET_BASE32, wrong, { nowMs: now }).valid).toBe(
        false,
      );
      expect(verifyTotp(RFC_SECRET_BASE32, '12345', { nowMs: now })).toEqual({
        valid: false,
        reason: 'MALFORMED',
      });
      expect(verifyTotp(RFC_SECRET_BASE32, 'abcdef', { nowMs: now })).toEqual({
        valid: false,
        reason: 'MALFORMED',
      });
    });
  });

  it('builds an otpauth URI authenticator apps accept', () => {
    const uri = buildOtpauthUri({
      issuer: 'DijiPeople',
      accountLabel: 'ada@example.com (Acme)',
      secretBase32: 'ABCDEFGH',
    });
    const parsed = new URL(uri);

    expect(parsed.protocol).toBe('otpauth:');
    expect(uri.startsWith('otpauth://totp/DijiPeople:')).toBe(true);
    expect(decodeURIComponent(parsed.pathname)).toBe(
      '/DijiPeople:ada@example.com (Acme)',
    );
    expect(parsed.searchParams.get('secret')).toBe('ABCDEFGH');
    expect(parsed.searchParams.get('issuer')).toBe('DijiPeople');
    expect(parsed.searchParams.get('algorithm')).toBe('SHA1');
    expect(parsed.searchParams.get('digits')).toBe('6');
    expect(parsed.searchParams.get('period')).toBe('30');
  });
});
