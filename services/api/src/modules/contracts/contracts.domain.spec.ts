import {
  cleanContractHtml,
  extractContractPlaceholders,
  renderContractPlaceholders,
  validateContractPlaceholderValues,
} from './contracts.service';

describe('contract document domain', () => {
  it('sanitizes unsafe content while preserving supported document formatting', () => {
    const result = cleanContractHtml(
      '<script>alert(1)</script><p style="text-align: center; font-size: 16px; position: fixed">Hello</p><a href="javascript:alert(1)">bad</a><hr data-page-break="true">',
    );
    expect(result).not.toContain('<script');
    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('position: fixed');
    expect(result).toContain('text-align:center');
    expect(result).toContain('font-size:16px');
    expect(result).toContain('data-page-break="true"');
  });

  it('extracts discoverable typed placeholder keys without duplicates', () => {
    expect(
      extractContractPlaceholders(
        '<p>{{partner.name}} {{contract.value}} {{partner.name}}</p>',
      ).map((item) => ({ key: item.key, dataType: item.dataType })),
    ).toEqual([
      { key: 'partner.name', dataType: 'PARTNER' },
      { key: 'contract.value', dataType: 'DECIMAL' },
    ]);
  });

  it('escapes resolved values and leaves unresolved tokens intact', () => {
    expect(
      renderContractPlaceholders(
        '<p>{{partner.name}} / {{contract.number}}</p>',
        { 'partner.name': '<Northstar>' },
      ),
    ).toBe('<p>&lt;Northstar&gt; / {{contract.number}}</p>');
  });

  it('validates required typed placeholder values before approval or signature', () => {
    const definitions = extractContractPlaceholders(
      '<p>{{partner.contact.email}} {{partner.commissionPercentage}} {{contract.effectiveDate}}</p>',
    );
    expect(
      validateContractPlaceholderValues(
        definitions,
        {
          'partner.contact.email': 'not-an-email',
          'partner.commissionPercentage': '110',
          'contract.effectiveDate': 'not-a-date',
        },
        true,
      ),
    ).toEqual([
      'Partner contact email must be a valid email address.',
      'Partner commission must be between 0 and 100.',
      'Effective date must be a valid date.',
    ]);
  });
});
