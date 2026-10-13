import {
  agreementCoverDetails,
  createPdf,
  partySignatories,
  recipientSignatories,
  renderContractVersionHtml,
  renderSignatureEvidenceTokens,
  signatureEvidenceAppendixHtml,
  signerPreviewSlot,
  type SignatureEvidenceForRender,
} from './contracts.service';
import {
  assignSignatureSlots,
  insertAdditionalSignatureBlocks,
} from './signature-blocks';

/*
 * CON-20261012-E7421CC1: three required signers (DijiPeople, the customer and
 * a second customer signatory) but only two signature blocks, because the
 * template names two slots. Every required signer must get exactly one block.
 */
const TEMPLATE = [
  '<h3>32. SIGNATURES</h3>',
  '<p><strong>FOR THE SERVICE PROVIDER</strong></p>',
  '<p>Signature: {{signature.platform.name}}</p>',
  '<p>Date: {{signature.platform.date}}</p>',
  '<p><strong>FOR THE CUSTOMER</strong></p>',
  '<p>Signature: {{signature.counterparty.name}}</p>',
  '<p>Date: {{signature.counterparty.date}}</p>',
  '<h1>SCHEDULE A</h1>',
].join('');

const PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function evidence(
  id: string,
  partyType: string,
  options: {
    method?: string;
    isPrimary?: boolean;
    signingOrder?: number;
    typedName?: string;
    minute?: number;
  } = {},
): SignatureEvidenceForRender {
  return {
    id,
    method: options.method ?? 'TYPED',
    typedName:
      options.typedName ??
      (options.method && options.method !== 'TYPED' ? null : id),
    typedStyle: null,
    signedAt: new Date(
      `2026-10-13T04:${String(options.minute ?? 0).padStart(2, '0')}:00Z`,
    ),
    signatureSha256: 'a'.repeat(64),
    recipient: {
      name: `${id} person`,
      email: `${id}@example.test`,
      signingOrder: options.signingOrder,
      party: {
        partyType,
        isPrimary: options.isPrimary ?? false,
        name: partyType === 'PLATFORM' ? 'DijiPeople' : `${id} org`,
        legalName: partyType === 'PLATFORM' ? 'DijiPeople Technologies' : null,
      },
    },
  };
}

const blockCount = (html: string) =>
  (html.match(/Electronically signed/g) ?? []).length;

describe('signature blocks for every required signer', () => {
  it.each([
    [1, [evidence('customer', 'CUSTOMER', { isPrimary: true })]],
    [
      2,
      [
        evidence('provider', 'PLATFORM', { isPrimary: true, signingOrder: 1 }),
        evidence('customer', 'CUSTOMER', { isPrimary: true, signingOrder: 2 }),
      ],
    ],
    [
      3,
      [
        evidence('provider', 'PLATFORM', { isPrimary: true, signingOrder: 1 }),
        evidence('customer', 'CUSTOMER', { isPrimary: true, signingOrder: 2 }),
        evidence('cosigner', 'CUSTOMER', { signingOrder: 3 }),
      ],
    ],
    [
      5,
      [
        evidence('provider', 'PLATFORM', { isPrimary: true, signingOrder: 1 }),
        evidence('provider2', 'PLATFORM', { signingOrder: 2 }),
        evidence('customer', 'CUSTOMER', { isPrimary: true, signingOrder: 3 }),
        evidence('cosigner', 'CUSTOMER', { signingOrder: 4 }),
        evidence('cosigner2', 'CUSTOMER', { signingOrder: 5 }),
      ],
    ],
  ])('%i signer(s) render exactly that many signatures', (count, rows) => {
    const html = renderSignatureEvidenceTokens(TEMPLATE, rows);
    expect(blockCount(html)).toBe(count);
    for (const row of rows)
      expect(html).toContain(`<strong>${row.id}</strong>`);
    // Generated blocks continue the signature section, before the schedules.
    expect(html.lastIndexOf('Electronically signed')).toBeLessThan(
      html.indexOf('SCHEDULE A'),
    );
  });

  it('labels each extra block with its party and signatory number', () => {
    const html = renderSignatureEvidenceTokens(TEMPLATE, [
      evidence('provider', 'PLATFORM', { isPrimary: true, signingOrder: 1 }),
      evidence('customer', 'CUSTOMER', { isPrimary: true, signingOrder: 2 }),
      evidence('cosigner', 'CUSTOMER', { signingOrder: 3 }),
    ]);
    expect(html).toContain('FOR THE CUSTOMER — AUTHORIZED SIGNATORY 2');
    // The co-signer signs for the customer, not as an organisation of one.
    expect(html).toContain('Legal Contracting Party: customer org');
    expect(html).toContain('Authorized Signatory: cosigner person');
  });

  it('renders mixed methods: drawn and uploaded as images, typed as the name', () => {
    const rows = [
      evidence('provider', 'PLATFORM', {
        method: 'DRAWN',
        isPrimary: true,
        signingOrder: 1,
      }),
      evidence('customer', 'CUSTOMER', {
        method: 'UPLOADED',
        isPrimary: true,
        signingOrder: 2,
      }),
      evidence('cosigner', 'CUSTOMER', {
        method: 'TYPED',
        typedName: 'Anoush',
        signingOrder: 3,
      }),
    ];
    const images = new Map([
      ['provider', `data:image/png;base64,${PIXEL}`],
      ['customer', `data:image/png;base64,${PIXEL}`],
    ]);
    const html = renderSignatureEvidenceTokens(TEMPLATE, rows, images);
    expect(html.match(/<img /g)).toHaveLength(2);
    expect(html).toContain('<strong>Anoush</strong>');
    expect(html).toContain('Drawn signature');
    expect(html).toContain('Uploaded signature');
    expect(html).toContain('Typed signature');
  });

  it('a parallel request whose co-signer signed first still fills the primary block with the primary signer', () => {
    const html = renderSignatureEvidenceTokens(
      '<p>Customer: {{signature.counterparty.name}}</p>',
      [
        evidence('cosigner', 'CUSTOMER', { signingOrder: 2, minute: 1 }),
        evidence('customer', 'CUSTOMER', {
          isPrimary: true,
          signingOrder: 1,
          minute: 5,
        }),
      ],
    );
    const [primaryBlock] = html.split('</p>');
    expect(primaryBlock).toContain('<strong>customer</strong>');
    expect(primaryBlock).not.toContain('cosigner');
  });

  it('never duplicates a signer, and is idempotent', () => {
    const signers = partySignatories([
      {
        id: 'p1',
        partyType: 'PLATFORM',
        name: 'DijiPeople',
        isPrimary: true,
        isSignatory: true,
        signatureRequired: true,
        signingOrder: 1,
      },
      {
        id: 'c1',
        partyType: 'CUSTOMER',
        name: 'Acme',
        isPrimary: true,
        isSignatory: true,
        signatureRequired: true,
        signingOrder: 2,
      },
      {
        id: 'c2',
        partyType: 'CUSTOMER',
        name: 'Anou',
        isPrimary: false,
        isSignatory: true,
        signatureRequired: true,
        signingOrder: 3,
      },
    ]);
    const once = insertAdditionalSignatureBlocks(TEMPLATE, signers);
    expect(insertAdditionalSignatureBlocks(once, signers)).toBe(once);
    expect(once.match(/additional-signature/g)).toHaveLength(1);
  });

  it('gives no block to a contact that is not a required signatory', () => {
    const signers = partySignatories([
      {
        id: 'c1',
        partyType: 'CUSTOMER',
        name: 'Acme',
        isPrimary: true,
        isSignatory: true,
        signatureRequired: true,
      },
      {
        id: 'billing',
        partyType: 'CUSTOMER',
        name: 'Billing contact',
        isSignatory: false,
        signatureRequired: false,
      },
      {
        id: 'optional',
        partyType: 'CUSTOMER',
        name: 'Optional signer',
        isSignatory: true,
        signatureRequired: false,
      },
    ]);
    expect(signers.map((signer) => signer.key)).toEqual(['c1']);
    expect(insertAdditionalSignatureBlocks(TEMPLATE, signers)).not.toContain(
      'additional-signature',
    );
  });

  it('a preview shows a pending block for each uncovered required signer; freezing adds none', () => {
    const signers = partySignatories([
      {
        id: 'p1',
        partyType: 'PLATFORM',
        name: 'DijiPeople',
        isPrimary: true,
        isSignatory: true,
        signatureRequired: true,
        signingOrder: 1,
      },
      {
        id: 'c1',
        partyType: 'CUSTOMER',
        name: 'Acme',
        isPrimary: true,
        isSignatory: true,
        signatureRequired: true,
        signingOrder: 2,
      },
      {
        id: 'c2',
        partyType: 'CUSTOMER',
        name: 'Anou',
        isSignatory: true,
        signatureRequired: true,
        signingOrder: 3,
      },
      {
        id: 'c3',
        partyType: 'CUSTOMER',
        name: 'Third',
        isSignatory: true,
        signatureRequired: true,
        signingOrder: 4,
      },
    ]);
    const preview = renderContractVersionHtml(
      TEMPLATE,
      [],
      'display',
      undefined,
      signers,
    );
    expect(preview.match(/Electronic signature pending/g)).toHaveLength(4);
    expect(preview).not.toContain('{{');
    const frozen = renderContractVersionHtml(
      TEMPLATE,
      [],
      'freeze',
      undefined,
      signers,
    );
    expect(frozen).not.toContain('additional-signature');
  });

  it('a template table signature layout gets extra blocks after the table', () => {
    const html = insertAdditionalSignatureBlocks(
      '<table><tr><td>{{signature.platform.name}}</td><td>{{signature.counterparty.name}}</td></tr></table><p>After</p>',
      [
        { key: 'p', partyType: 'PLATFORM', name: 'P', signingOrder: 1 },
        {
          key: 'c',
          partyType: 'CUSTOMER',
          name: 'C',
          isPrimary: true,
          signingOrder: 2,
        },
        { key: 'x', partyType: 'CUSTOMER', name: 'X', signingOrder: 3 },
      ],
    );
    expect(html.indexOf('additional-signature')).toBeGreaterThan(
      html.indexOf('</table>'),
    );
    expect(html.indexOf('additional-signature')).toBeLessThan(
      html.indexOf('After'),
    );
  });

  it('extends the seeded inline signature lines (partner and service-order templates)', async () => {
    const inline = [
      '<h2>Signatures</h2>',
      '<p data-document-role="platform-signature">For DijiPeople: {{signature.platform.name}} &mdash; {{signature.platform.date}}</p>',
      '<p>For Northstar: {{signature.counterparty.name}} &mdash; {{signature.counterparty.date}}</p>',
      '<p>Annex</p>',
    ].join('');
    const rows = [
      evidence('provider', 'PLATFORM', { isPrimary: true, signingOrder: 1 }),
      evidence('partner', 'PARTNER', { isPrimary: true, signingOrder: 2 }),
      evidence('partner2', 'PARTNER', { signingOrder: 3 }),
    ];
    const html = renderSignatureEvidenceTokens(inline, rows);
    expect(blockCount(html)).toBe(3);
    expect(html).toContain('FOR THE PARTNER — AUTHORIZED SIGNATORY 2');
    expect(html.indexOf('additional-signature')).toBeLessThan(
      html.indexOf('Annex'),
    );
    // Two signers: exactly the template's own two lines, nothing generated.
    expect(
      renderSignatureEvidenceTokens(inline, rows.slice(0, 2)),
    ).not.toContain('additional-signature');
    expect((await createPdf('Agreement', html)).length).toBeGreaterThan(1000);
  });

  it('leaves a document with no signature section unchanged', () => {
    expect(
      insertAdditionalSignatureBlocks('<p>Body</p>', [
        { key: 'c', partyType: 'CUSTOMER', name: 'C' },
      ]),
    ).toBe('<p>Body</p>');
  });

  it("a co-signer's mark is recorded under its own block, not the primary customer's", () => {
    const recipients = [
      {
        id: 'r1',
        partyId: 'p1',
        signingOrder: 1,
        party: { partyType: 'PLATFORM', isPrimary: true },
      },
      {
        id: 'r2',
        partyId: 'c1',
        signingOrder: 2,
        party: { partyType: 'CUSTOMER', isPrimary: true },
      },
      {
        id: 'r3',
        partyId: 'c2',
        signingOrder: 3,
        party: { partyType: 'CUSTOMER', isPrimary: false },
      },
    ];
    expect(signerPreviewSlot(recipients[0], recipients)).toBe('platform');
    expect(signerPreviewSlot(recipients[1], recipients)).toBe('counterparty');
    expect(signerPreviewSlot(recipients[2], recipients)).toBe('signer.c2');
  });

  it('the signing page lists optional recipients without a block', () => {
    const signers = recipientSignatories([
      {
        id: 'r1',
        name: 'A',
        isRequired: true,
        party: { partyType: 'CUSTOMER', isPrimary: true },
      },
      {
        id: 'r2',
        name: 'B',
        isRequired: false,
        party: { partyType: 'CUSTOMER' },
      },
    ]);
    expect(signers.map((signer) => signer.key)).toEqual(['r1']);
  });

  it('assigns slots by signing order, not by array order', () => {
    const { slots } = assignSignatureSlots([
      { partyType: 'PLATFORM', signingOrder: 2, tag: 'second' },
      { partyType: 'PLATFORM', signingOrder: 1, tag: 'first' },
    ]);
    expect(slots.platform?.tag).toBe('first');
  });
});

describe('agreement version is the same on the cover and in the appendix', () => {
  it('prints the issued agreement version, and the signing record separately', () => {
    const rows = [evidence('customer', 'CUSTOMER', { isPrimary: true })];
    const appendix = signatureEvidenceAppendixHtml({
      contractNumber: 'CON-1',
      agreementVersion: '1',
      signingRecordVersion: 2,
      documentSha256: 'b'.repeat(64),
      requestNumber: 'SIG-1',
      evidence: rows,
      signatureEvents: [],
      timeline: [],
    });
    const cover = agreementCoverDetails({
      contractNumber: 'CON-1',
      agreementVersion: '1',
      values: {
        'contract.version': '1',
        'platform.legalName': 'DijiPeople Technologies',
      },
      status: 'Executed',
      executedAt: null,
    });
    expect(appendix).toContain('<td>Agreement version</td><td>1</td>');
    expect(appendix).toContain('Immutable signing snapshot 2');
    expect(cover.rows).toContainEqual(['Agreement version', '1']);
    expect(cover.reference).toBe('CON-1 · Version 1');
  });

  it('a generated PDF with a cover and appendix carries every signature image', async () => {
    const rows = [
      evidence('provider', 'PLATFORM', {
        method: 'DRAWN',
        isPrimary: true,
        signingOrder: 1,
      }),
      evidence('customer', 'CUSTOMER', {
        method: 'UPLOADED',
        isPrimary: true,
        signingOrder: 2,
      }),
      evidence('cosigner', 'CUSTOMER', { method: 'DRAWN', signingOrder: 3 }),
    ];
    const images = new Map(
      rows.map((row) => [row.id, `data:image/png;base64,${PIXEL}`]),
    );
    const html = renderSignatureEvidenceTokens(TEMPLATE, rows, images);
    const pdf = await createPdf('Test', html, '', {
      cover: agreementCoverDetails({
        contractNumber: 'CON-1',
        agreementVersion: '1',
        values: {},
        status: 'Executed',
        executedAt: null,
      }),
      appendixHtml: signatureEvidenceAppendixHtml({
        contractNumber: 'CON-1',
        agreementVersion: '1',
        signingRecordVersion: 2,
        documentSha256: 'b'.repeat(64),
        requestNumber: 'SIG-1',
        evidence: rows,
        signatureEvents: [],
        timeline: [],
      }),
    });
    const imageCount = (buffer: Buffer) =>
      (buffer.toString('latin1').match(/\/Subtype \/Image/g) ?? []).length;
    const twoSigners = await createPdf(
      'Test',
      renderSignatureEvidenceTokens(TEMPLATE, rows.slice(0, 2), images),
    );
    // Each PNG is an image plus its alpha mask: one more signer, one more pair.
    expect(imageCount(pdf)).toBe(imageCount(twoSigners) * 1.5);
  });
});
