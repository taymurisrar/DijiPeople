import { agreementDateProblems } from './agreement-terms';
import {
  partySignatories,
  platformIdentityValues,
  renderContractVersionHtml,
} from './contracts.service';
import { insertAdditionalSignatureBlocks } from './signature-blocks';

/*
 * Owner decisions of 2026-10-13 on the executed CON-20261012-E7421CC1
 * (ITEM-0230): the price is per Active Employee per month; an expiry that
 * disagrees with the pilot end was a mistake nothing caught; the provider may
 * contract as a company or an individual; a second signer may sign for a party
 * or be a party of its own.
 */
const label = (key: string) => key;

describe('agreement dates that contradict each other', () => {
  const keys = new Set([
    'contract.effectiveDate',
    'commercial.pilotStartDate',
    'commercial.pilotEndDate',
    'contract.expiryDate',
  ]);
  const values = {
    'contract.effectiveDate': '2026-10-14',
    'commercial.pilotStartDate': '2026-10-15',
    'commercial.pilotEndDate': '2027-01-15',
    'contract.expiryDate': '2027-01-15',
  };

  it('accepts a pilot agreement that expires when its pilot ends', () => {
    expect(agreementDateProblems(keys, values, label)).toEqual([]);
  });

  it('refuses the CON-20261012-E7421CC1 mistake: expiry after the pilot end', () => {
    const problems = agreementDateProblems(
      keys,
      { ...values, 'contract.expiryDate': '2027-01-30' },
      label,
    );
    expect(problems).toEqual([
      expect.objectContaining({
        field: 'contract.expiryDate',
        message: expect.stringContaining(
          'must be the pilot end date',
        ) as unknown,
      }),
    ]);
  });

  it('refuses a pilot that starts before the agreement or ends before it starts', () => {
    const problems = agreementDateProblems(
      keys,
      {
        ...values,
        'commercial.pilotStartDate': '2026-10-01',
        'commercial.pilotEndDate': '2026-09-30',
        'contract.expiryDate': '2026-09-30',
      },
      label,
    );
    expect(problems.map((problem) => problem.field)).toEqual([
      'commercial.pilotStartDate',
      'commercial.pilotEndDate',
      'contract.expiryDate',
    ]);
  });

  it('ignores dates the document does not use, and values that are not dates', () => {
    expect(
      agreementDateProblems(
        new Set(['contract.effectiveDate', 'contract.expiryDate']),
        { ...values, 'contract.expiryDate': '2027-01-30' },
        label,
      ),
    ).toEqual([]);
    expect(
      agreementDateProblems(
        keys,
        { ...values, 'contract.expiryDate': 'TBD' },
        label,
      ),
    ).toEqual([]);
  });
});

describe('the provider contracts as a company or as an individual', () => {
  const profile = {
    legalName: 'DijiPeople Technologies',
    registrationNumber: '',
    entityType: 'Company',
    proprietorName: '',
  };

  it('a company without a registration number is its legal name only', () => {
    expect(platformIdentityValues(profile)).toEqual({
      'platform.entityType': 'Company',
      'platform.legalIdentity': 'DijiPeople Technologies',
    });
  });

  it('a registered company states its number', () => {
    expect(
      platformIdentityValues({ ...profile, registrationNumber: 'CR-1' })[
        'platform.legalIdentity'
      ],
    ).toBe('DijiPeople Technologies, a company registered under number CR-1');
  });

  it('an individual trades under the legal name, defaulting to the authorized signer', () => {
    expect(
      platformIdentityValues(
        { ...profile, entityType: 'Individual' },
        { 'platform.authorizedSigner.name': 'Taimur Israr' },
      ),
    ).toEqual({
      'platform.entityType': 'Individual',
      'platform.legalIdentity':
        'Taimur Israr, an individual trading as DijiPeople Technologies',
    });
    expect(
      platformIdentityValues(
        { ...profile, entityType: 'Individual', proprietorName: 'A. Owner' },
        { 'platform.authorizedSigner.name': 'Taimur Israr' },
      )['platform.legalIdentity'],
    ).toBe('A. Owner, an individual trading as DijiPeople Technologies');
  });
});

describe('a second signer signs for a party or as a party of its own', () => {
  const template =
    '<p><strong>FOR THE CUSTOMER</strong></p><p>Signature: {{signature.counterparty.name}}</p>';
  const parties = (signingCapacity?: string) =>
    partySignatories([
      {
        id: 'acme',
        partyType: 'CUSTOMER',
        name: 'Acme',
        legalName: 'Acme Ltd',
        isPrimary: true,
        isSignatory: true,
        signatureRequired: true,
        signingOrder: 1,
      },
      {
        id: 'second',
        partyType: 'CUSTOMER',
        name: 'Beta Holdings',
        legalName: 'Beta Holdings LLC',
        isSignatory: true,
        signatureRequired: true,
        signingOrder: 2,
        metadata: signingCapacity ? { signingCapacity } : null,
      },
    ]);

  it('an additional signatory signs for the primary party, even with a legal name of its own', () => {
    const html = insertAdditionalSignatureBlocks(
      template,
      parties('ADDITIONAL_SIGNATORY'),
    );
    expect(html).toContain('FOR THE CUSTOMER — AUTHORIZED SIGNATORY 2');
    expect(html).toContain('Legal Contracting Party: Acme Ltd');
  });

  it('a separate party signs for itself, under its own name', () => {
    const html = insertAdditionalSignatureBlocks(
      template,
      parties('SEPARATE_PARTY'),
    );
    expect(html).toContain('FOR BETA HOLDINGS LLC');
    expect(html).toContain('Legal Contracting Party: Beta Holdings LLC');
    expect(html).not.toContain('AUTHORIZED SIGNATORY 2');
  });

  it('a party with no recorded choice keeps the earlier rule', () => {
    expect(insertAdditionalSignatureBlocks(template, parties())).toContain(
      'Legal Contracting Party: Beta Holdings LLC',
    );
  });
});

describe('the agreed price states its basis', () => {
  it('reads per Active Employee per month unless the agreement says otherwise', () => {
    const html =
      '<p>Rate: {{commercial.agreedPrice}} {{commercial.priceBasis}}</p>';
    const rows = [
      { key: 'commercial.agreedPrice', value: '6000', source: 'manual' },
      { key: 'contract.currency', value: 'PKR', source: 'create' },
    ];
    expect(renderContractVersionHtml(html, rows, 'freeze')).toBe(
      '<p>Rate: PKR 6,000.00 per Active Employee per month</p>',
    );
  });
});
