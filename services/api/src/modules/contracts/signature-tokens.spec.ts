import {
  normalizeSignatureTokens,
  parseSignatureTokenKey,
} from './signature-tokens';
import {
  cleanContractHtml,
  extractContractPlaceholders,
  omitPlatformSignatureLines,
  renderContractVersionHtml,
  renderSignatureEvidenceTokens,
} from './contracts.service';

/*
 * One signature representation — `{{signature.<slot>.<field>}}` — read by the
 * editor, stored by templates, frozen at send and filled at signing. These pin
 * that older spellings keep working without rewriting any stored template.
 */
describe('signature tokens', () => {
  it('parses the canonical slots and fields', () => {
    expect(parseSignatureTokenKey('signature.platform.name')).toEqual({
      key: 'signature.platform.name',
      slot: 'platform',
      field: 'name',
    });
    expect(parseSignatureTokenKey('signature.party.primary.date')?.key).toBe(
      'signature.party.primary.date',
    );
    expect(parseSignatureTokenKey('signature.counterparty.initials')?.key).toBe(
      'signature.counterparty.initials',
    );
  });

  it('maps legacy party and field spellings onto the canonical slot', () => {
    expect(parseSignatureTokenKey('signature.partner.name')?.key).toBe(
      'signature.counterparty.name',
    );
    expect(parseSignatureTokenKey('signature.customer.signedAt')?.key).toBe(
      'signature.counterparty.date',
    );
    expect(parseSignatureTokenKey('signature.dijipeople.signature')?.key).toBe(
      'signature.platform.name',
    );
  });

  it('leaves a party nobody signs for electronically untouched', () => {
    expect(parseSignatureTokenKey('signature.witness.name')).toBeNull();
    expect(parseSignatureTokenKey('signature.platform.initials')).toBeNull();
    expect(parseSignatureTokenKey('customer.legalName')).toBeNull();
    expect(normalizeSignatureTokens('<p>{{signature.witness.name}}</p>')).toBe(
      '<p>{{signature.witness.name}}</p>',
    );
  });

  it('canonicalises whitespace and aliases in stored HTML, nothing else', () => {
    const legacy =
      '<p>{{ signature.platform.name }} — {{signature.partner.signedDate}} {{ customer.legalName }}</p>';
    expect(normalizeSignatureTokens(legacy)).toBe(
      '<p>{{signature.platform.name}} — {{signature.counterparty.date}} {{ customer.legalName }}</p>',
    );
  });

  it('is applied when HTML is saved', () => {
    expect(cleanContractHtml('<p>{{ signature.partner.name }}</p>')).toBe(
      '<p>{{signature.counterparty.name}}</p>',
    );
  });

  it('a legacy token is held back at freeze and shown pending in a preview', () => {
    const html = '<p>{{signature.partner.name}}</p>';
    expect(renderContractVersionHtml(html, [], 'freeze')).toBe(
      '<p>{{signature.counterparty.name}}</p>',
    );
    expect(renderContractVersionHtml(html, [], 'display')).toContain(
      'Electronic signature pending',
    );
  });

  it('a legacy token is filled from the right signer in the executed copy', () => {
    const evidence = (name: string, partyType: string) => ({
      id: name,
      method: 'TYPED',
      typedName: name,
      typedStyle: null,
      signedAt: new Date('2026-08-01T10:00:00Z'),
      signatureSha256: 'a'.repeat(64),
      recipient: { name, party: { partyType } },
    });
    const html = renderSignatureEvidenceTokens(
      '<p>{{ signature.dijipeople.name }}</p><p>{{signature.partner.name}}</p>',
      [evidence('Platform Signer', 'PLATFORM'), evidence('Noura', 'PARTNER')],
    );
    const [platformLine, partnerLine] = html.split('</p>');
    expect(platformLine).toContain('Platform Signer');
    expect(partnerLine).toContain('Noura');
  });

  it('a legacy platform token is still omitted when the platform does not sign', () => {
    expect(
      omitPlatformSignatureLines(
        '<p>{{ signature.dijipeople.name }}</p><p>Body</p>',
        false,
      ),
    ).toBe('<p>Body</p>');
  });

  it('extraction reports the canonical key, so validation sees a known field', () => {
    expect(
      extractContractPlaceholders('<p>{{signature.partner.signedAt}}</p>').map(
        (definition) => definition.key,
      ),
    ).toEqual(['signature.counterparty.date']);
  });
});
