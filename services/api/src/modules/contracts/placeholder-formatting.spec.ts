import {
  CONTRACT_PLACEHOLDER_REGISTRY,
  formatPlaceholderValue,
  renderContractPlaceholders,
} from './contracts.service';

const definition = (key: string) => {
  const found = CONTRACT_PLACEHOLDER_REGISTRY.find((item) => item.key === key);
  if (!found) throw new Error(`No placeholder registered for ${key}`);
  return found;
};

/**
 * What a contract prints.
 *
 * `formattingRule` was declared on nineteen placeholders — `'currency'`,
 * `'locale-date'`, `'0.##%'` — and read by nothing. The renderer escaped every
 * scalar verbatim, so an executed service order said "Uptime target 99.5."
 * where it meant 99.5%, and printed an ISO timestamp where it meant a date. A
 * declared rule that nothing applies reads in review as a solved problem, which
 * is why it survived: the registry looked right.
 *
 * These are assertions about a signed document, not about a preview.
 */
describe('placeholder formatting', () => {
  it('gives a percentage its sign', () => {
    expect(formatPlaceholderValue('99.5', definition('sla.uptimeTarget'))).toBe(
      '99.5%',
    );
  });

  it('drops trailing zeros a contract has no use for', () => {
    // "100%" not "100.00%", "99.5%" not "99.50%".
    expect(
      formatPlaceholderValue('100.00', definition('sla.uptimeTarget')),
    ).toBe('100%');
    expect(
      formatPlaceholderValue('99.50', definition('sla.uptimeTarget')),
    ).toBe('99.5%');
  });

  it('writes a date the way both parties read it the same', () => {
    /*
     * "1 October 2026", never "10/01/2026" — a numeric date is October the
     * first in one country and the tenth of January in another, and a go-live
     * date that means two things is the ambiguity a contract exists to remove.
     */
    expect(
      formatPlaceholderValue(
        '2026-10-01',
        definition('implementation.targetGoLiveDate'),
      ),
    ).toBe('1 October 2026');
  });

  it('keeps the time only where the type asks for one', () => {
    const value = formatPlaceholderValue(
      '2026-08-01T10:00:00Z',
      definition('tenant.provisionedAt'),
    );
    expect(value).toContain('1 August 2026');
    expect(value).toContain('UTC');
  });

  it('prefixes a money value with the currency the agreement is in', () => {
    const rendered = renderContractPlaceholders(
      '<p>{{commercial.agreedPrice}}</p>',
      { 'commercial.agreedPrice': '1200', 'contract.currency': 'SAR' },
    );
    // Never a bare number whose unit the reader infers from another paragraph.
    expect(rendered).toBe('<p>SAR 1,200.00</p>');
  });

  it('still renders money when the agreement carries no currency', () => {
    const rendered = renderContractPlaceholders(
      '<p>{{commercial.agreedPrice}}</p>',
      { 'commercial.agreedPrice': '1200' },
    );
    expect(rendered).toBe('<p>1,200.00</p>');
  });

  it('renders a boolean as a word', () => {
    expect(
      formatPlaceholderValue(
        'true',
        definition('implementation.dataMigrationRequired'),
      ),
    ).toBe('Yes');
    expect(
      formatPlaceholderValue(
        'no',
        definition('implementation.dataMigrationRequired'),
      ),
    ).toBe('No');
  });

  it('separates thousands in a count', () => {
    expect(
      formatPlaceholderValue(
        '5000',
        definition('implementation.estimatedRecords'),
      ),
    ).toBe('5,000');
  });

  it('renders a collection as a list rather than as JSON', () => {
    /*
     * The reported symptom: a service order whose "Enabled modules" section
     * read `["Employees","Attendance","Payroll"]`.
     */
    const rendered = renderContractPlaceholders('<p>{{tenant.modules}}</p>', {
      'tenant.modules': '["Employees","Attendance","Payroll"]',
    });
    expect(rendered).toContain('<li>Employees</li>');
    expect(rendered).not.toContain('[&quot;');
  });

  it('renders a collection of objects as a table', () => {
    const rendered = renderContractPlaceholders(
      '<p>{{integration.items}}</p>',
      {
        'integration.items':
          '[{"name":"Payroll bank file","type":"Export","status":"In scope"}]',
      },
    );
    expect(rendered).toContain('<th>Name</th>');
    expect(rendered).toContain('<td>Payroll bank file</td>');
  });

  it('returns an uninterpretable value unchanged rather than as nonsense', () => {
    /*
     * A contract that prints the raw string is recoverable. One that prints
     * "Invalid Date" or "NaN%" has replaced the customer's data with a symptom
     * of our bug, and nobody can tell what it was supposed to say.
     */
    expect(
      formatPlaceholderValue('to be agreed', definition('sla.uptimeTarget')),
    ).toBe('to be agreed');
    expect(
      formatPlaceholderValue(
        'on completion',
        definition('implementation.targetGoLiveDate'),
      ),
    ).toBe('on completion');
  });

  it('leaves text and identifiers untouched', () => {
    expect(
      formatPlaceholderValue(
        'Gulf Horizon',
        definition('customer.companyName'),
      ),
    ).toBe('Gulf Horizon');
  });

  it('does not double-print the country a customer address already carries', () => {
    /*
     * `customer.address` is assembled from addressLine1, addressLine2, city,
     * stateProvince and country. The example must show that, or a template
     * author appends the country they think is missing — which is exactly what
     * the seeded service order did, printing "Dammam, Saudi Arabia, Saudi
     * Arabia" on every real document.
     */
    expect(definition('customer.address').exampleValue).toContain(
      'Saudi Arabia',
    );
  });
});
