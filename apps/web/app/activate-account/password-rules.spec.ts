import {
  comparePasswords,
  describeComparison,
  evaluatePasswordPolicy,
} from './password-rules';

describe('comparePasswords', () => {
  it('accepts identical strings, spaces included', () => {
    expect(comparePasswords(' a b ', ' a b ')).toEqual({ ok: true });
  });
  it('does not trim away a real difference', () => {
    expect(comparePasswords('abc', 'abd')).toEqual({ ok: false, reason: 'mismatch' });
  });
  it('names a whitespace-only difference', () => {
    const r = comparePasswords('secret', 'secret ');
    expect(r).toEqual({ ok: false, reason: 'whitespace-only-difference' });
    expect(describeComparison(r)).toMatch(/leading or trailing space/);
  });
  it('treats an empty field as not yet comparable', () => {
    expect(comparePasswords('', 'x')).toEqual({ ok: false, reason: 'empty' });
    expect(describeComparison({ ok: false, reason: 'empty' })).toBeNull();
  });
});

describe('evaluatePasswordPolicy', () => {
  const policy = { minimumPasswordLength: 10, requireUppercase: true, requireLowercase: false, requireNumber: true, requireSpecialCharacter: true };
  it('lists only the rules the policy enables', () => {
    expect(evaluatePasswordPolicy('', policy).map((r) => r.key)).toEqual(['length', 'upper', 'number', 'special']);
  });
  it('marks rules met', () => {
    const rules = evaluatePasswordPolicy('Abcdefgh1!', policy);
    expect(rules.every((r) => r.met)).toBe(true);
  });
  it('does not count whitespace as special', () => {
    const rules = evaluatePasswordPolicy('Abcdefgh1 ', policy);
    expect(rules.find((r) => r.key === 'special')?.met).toBe(false);
  });
});
