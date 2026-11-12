import {
  checkReceivedAmount,
  generateBankReference,
  isValidIban,
  maskAccountTitle,
  maskIdentifier,
  normalizeBankReference,
  sanitizeEvidenceFileName,
  sniffEvidenceKind,
  toMinorUnits,
} from './bank-transfer.rules';

describe('bank-transfer rules', () => {
  describe('generateBankReference', () => {
    it('is human-typable and unambiguous', () => {
      for (let i = 0; i < 200; i += 1) {
        expect(generateBankReference()).toMatch(
          /^DP-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}$/,
        );
      }
    });

    it('does not repeat in a realistic batch', () => {
      const seen = new Set(Array.from({ length: 2000 }, generateBankReference));
      expect(seen.size).toBe(2000);
    });
  });

  describe('checkReceivedAmount', () => {
    const expected = { amount: '25000.00', currency: 'PKR' };

    it('accepts only an exact match to the minor unit', () => {
      expect(
        checkReceivedAmount(expected, { amount: '25000', currency: 'pkr' }),
      ).toEqual({ ok: true });
      expect(
        checkReceivedAmount(expected, { amount: 25000, currency: 'PKR' }),
      ).toEqual({ ok: true });
    });

    it('classifies part payment, overpayment and wrong currency', () => {
      expect(
        checkReceivedAmount(expected, { amount: '24999.99', currency: 'PKR' }),
      ).toEqual({
        ok: false,
        reason: 'UNDERPAID',
      });
      expect(
        checkReceivedAmount(expected, { amount: '25000.01', currency: 'PKR' }),
      ).toEqual({
        ok: false,
        reason: 'OVERPAID',
      });
      expect(
        checkReceivedAmount(expected, { amount: '25000.00', currency: 'USD' }),
      ).toEqual({
        ok: false,
        reason: 'CURRENCY_MISMATCH',
      });
    });

    it('is not fooled by float rounding', () => {
      // 0.1 + 0.2 style drift must never be read as a match or a mismatch.
      expect(toMinorUnits('0.30')).toBe(30n);
      expect(
        checkReceivedAmount(
          { amount: '0.30', currency: 'PKR' },
          { amount: '0.3', currency: 'PKR' },
        ),
      ).toEqual({ ok: true });
    });

    it('rejects a malformed amount', () => {
      expect(() => toMinorUnits('12,000')).toThrow();
      expect(() => toMinorUnits('abc')).toThrow();
    });
  });

  describe('references', () => {
    it('normalises whitespace and case', () => {
      expect(normalizeBankReference(' dp-ab12 cd34 ')).toBe('DP-AB12CD34');
    });
  });

  describe('IBAN', () => {
    it('accepts a checksum-valid IBAN and rejects a tampered one', () => {
      expect(isValidIban('GB82 WEST 1234 5698 7654 32')).toBe(true);
      expect(isValidIban('PK36SCBL0000001123456702')).toBe(true);
      expect(isValidIban('GB82 WEST 1234 5698 7654 33')).toBe(false);
      expect(isValidIban('not an iban')).toBe(false);
    });
  });

  describe('masking', () => {
    it('hides the middle of an identifier', () => {
      const masked = maskIdentifier('PK36SCBL0000001123456702');
      expect(masked.startsWith('PK36')).toBe(true);
      expect(masked.endsWith('6702')).toBe(true);
      expect(masked).not.toContain('0000001123');
    });

    it('never reveals a short identifier whole', () => {
      expect(maskIdentifier('12345')).not.toContain('123');
    });

    it('keeps only initials of an account title', () => {
      expect(maskAccountTitle('Dijipeople Pvt Ltd')).toBe('D••••••••• P•• L••');
    });
  });

  describe('evidence', () => {
    it('identifies files by signature, not by name or declared type', () => {
      expect(sniffEvidenceKind(Buffer.from('%PDF-1.7\n'))).toBe(
        'application/pdf',
      );
      expect(
        sniffEvidenceKind(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
        ),
      ).toBe('image/png');
      expect(sniffEvidenceKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(
        'image/jpeg',
      );
    });

    it('refuses scripts, HTML, SVG and executables renamed to look like receipts', () => {
      expect(
        sniffEvidenceKind(Buffer.from('<script>alert(1)</script>')),
      ).toBeNull();
      expect(
        sniffEvidenceKind(
          Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        ),
      ).toBeNull();
      expect(sniffEvidenceKind(Buffer.from('MZ\x90\x00'))).toBeNull();
      expect(sniffEvidenceKind(Buffer.alloc(0))).toBeNull();
    });

    it('strips paths and control characters from file names', () => {
      expect(sanitizeEvidenceFileName('../../etc/passwd')).toBe('passwd');
      expect(sanitizeEvidenceFileName('C:\\temp\\a<b>.png')).toBe('ab.png');
      expect(sanitizeEvidenceFileName('   ')).toBe('evidence');
      expect(sanitizeEvidenceFileName('x'.repeat(500)).length).toBe(120);
    });
  });
});
