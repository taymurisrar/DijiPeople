import { CustomerOriginChannel } from '@prisma/client';
import { resolveOriginChannel } from './origin-channel';

/**
 * ITEM-0008 — channel is a reporting dimension the platform owns, so the mapping
 * into it has to be honest about what it does not know.
 *
 * `Lead.source` is free text an admin can set to anything. The risk this pins is
 * not a missed mapping; it is a *confident wrong* one — quietly calling an
 * unrecognised source WEBSITE because most leads are website leads would put a
 * value into a commercial report that reads exactly like a correct one.
 */
describe('resolveOriginChannel', () => {
  it('maps the two sources the platform itself issues', () => {
    // These are the literals `LeadsService.submitLead` writes.
    expect(resolveOriginChannel('Website')).toBe(CustomerOriginChannel.WEBSITE);
    expect(resolveOriginChannel('Partner Referral')).toBe(
      CustomerOriginChannel.PARTNER_REFERRAL,
    );
  });

  it('ignores case and surrounding whitespace', () => {
    expect(resolveOriginChannel('  website ')).toBe(
      CustomerOriginChannel.WEBSITE,
    );
    expect(resolveOriginChannel('PARTNER REFERRAL')).toBe(
      CustomerOriginChannel.PARTNER_REFERRAL,
    );
  });

  it('sends an unrecognised source to OTHER rather than guessing', () => {
    for (const source of [
      'Trade show',
      'LinkedIn',
      'referral',
      'partner',
      'web',
    ]) {
      expect(resolveOriginChannel(source)).toBe(CustomerOriginChannel.OTHER);
    }
  });

  it('never infers DIRECT from a missing source', () => {
    /*
     * DIRECT is a positive claim that someone created the customer by hand in
     * admin. A lead with a blank source is not evidence of that — it is a lead,
     * so it arrived some other way.
     */
    for (const source of [null, undefined, '', '   ']) {
      expect(resolveOriginChannel(source)).toBe(CustomerOriginChannel.OTHER);
    }
  });

  it('never returns DIRECT at all', () => {
    // DIRECT is set at the no-lead creation path, never derived from a lead.
    const sources = ['Website', 'Partner Referral', 'anything', '', null];
    for (const source of sources) {
      expect(resolveOriginChannel(source)).not.toBe(
        CustomerOriginChannel.DIRECT,
      );
    }
  });
});
