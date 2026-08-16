import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ITEM-0030 — the partnership model must survive conversion to a Partner.
 *
 * `PartnerInquiry` has captured which commercial relationship is being proposed
 * since Wave 3 — reseller, referral, implementation — and it is the field an
 * operator actually triages on. `Partner` did not carry it, so the moment an
 * inquiry became a partner the answer was gone, recoverable only by going back
 * to the inquiry if one still existed.
 *
 * Asserted against the service source rather than by executing the conversion:
 * both `tx.partner.create` calls sit inside a transaction that also touches
 * agreements, timelines and referral links, and standing all of that up to
 * observe one field would break for reasons unrelated to what is being checked.
 * The property here is structural — the field is passed, from the right source —
 * and that is what the source shows.
 */
describe('partnership model survives conversion', () => {
  const source = readFileSync(
    join(__dirname, 'partner-experience.service.ts'),
    'utf8',
  );

  const code = source
    .split(/\r?\n/)
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');

  it('has both partner creation sites', () => {
    // If these stop existing the assertions below would pass vacuously.
    const creates = code.match(/tx\.partner\.create\(/g) ?? [];
    expect(creates.length).toBe(2);
  });

  it('carries the model on every partner it creates', () => {
    const assignments = code.match(/partnershipModel:\s*[^,\n]+/g) ?? [];

    // Two conversion sites plus the inquiry row itself.
    expect(assignments.length).toBeGreaterThanOrEqual(3);
  });

  it('takes it from the inquiry, not from a default', () => {
    /*
     * The failure this guards against is subtle: passing a literal, or the
     * request DTO, on the path that converts an *existing* inquiry. That would
     * compile, look right, and silently record the wrong relationship for every
     * partner converted by an operator who did not retype it.
     */
    expect(code).toMatch(/partnershipModel:\s*inquiry\.partnershipModel/);
    expect(code).toMatch(/partnershipModel:\s*dto\.partnershipModel/);
  });

  it('never hardcodes a partnership model', () => {
    // A fabricated commercial fact is worse than a null one.
    expect(code).not.toMatch(/partnershipModel:\s*['"]/);
    expect(code).not.toMatch(/partnershipModel:\s*PartnershipModel\./);
  });
});
