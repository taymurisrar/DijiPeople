import {
  omitPlatformSignatureLines,
  platformSignsContract,
} from './contracts.service';
import { PLATFORM_CONTRACT_TEMPLATES } from '../../../prisma/seed-config';

/**
 * Owner decision (TASK-0032, 2026-09-25): the DijiPeople signature line is shown
 * only when DijiPeople actually signs. Before it, an executed partner or
 * customer agreement — where DijiPeople is not a signatory by default — printed
 * "Not signed" beside the platform's name.
 */
describe('platform signature lines follow whether DijiPeople signs', () => {
  const html = [
    '<h2>Signatures</h2>',
    '<p data-document-role="platform-signature">For {{platform.legalName}}: {{signature.platform.name}} &mdash; {{signature.platform.date}}</p>',
    '<p>For {{partner.name}}: {{signature.counterparty.name}} &mdash; {{signature.counterparty.date}}</p>',
    '<p>An authored line: {{signature.platform.name}}</p>',
    '<p>{{platform.legalName}} agrees.</p>',
  ].join('');

  it('removes marked and token-bearing platform lines when DijiPeople does not sign', () => {
    const result = omitPlatformSignatureLines(html, false);

    expect(result).not.toContain('signature.platform');
    expect(result).not.toContain('platform-signature');
    // The counterparty's line and ordinary platform text are untouched.
    expect(result).toContain('{{signature.counterparty.name}}');
    expect(result).toContain('<p>{{platform.legalName}} agrees.</p>');
    expect(result).toContain('<h2>Signatures</h2>');
  });

  it('keeps everything when DijiPeople signs', () => {
    expect(omitPlatformSignatureLines(html, true)).toBe(html);
  });

  it('counts only a signing PLATFORM party', () => {
    expect(
      platformSignsContract([
        { partyType: 'PLATFORM', isSignatory: false },
        { partyType: 'PARTNER', isSignatory: true },
      ]),
    ).toBe(false);
    expect(
      platformSignsContract([{ partyType: 'PLATFORM', isSignatory: true }]),
    ).toBe(true);
    expect(
      platformSignsContract([
        { partyType: 'PLATFORM', isSignatory: false, signatureRequired: true },
      ]),
    ).toBe(true);
  });

  it('marks the platform signature lines of every system template', () => {
    for (const template of PLATFORM_CONTRACT_TEMPLATES) {
      const withoutPlatform = omitPlatformSignatureLines(
        template.contentHtml,
        false,
      );
      expect({
        key: template.key,
        leftover: withoutPlatform.includes('signature.platform'),
      }).toEqual({ key: template.key, leftover: false });
    }
  });
});
