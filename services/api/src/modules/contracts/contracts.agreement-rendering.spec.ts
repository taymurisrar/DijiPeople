import { inflateSync } from 'node:zlib';
import { BadRequestException } from '@nestjs/common';
import { ContractType, PlatformUserRole } from '@prisma/client';
import {
  ContractsService,
  renderContractVersionHtml,
  renderSignatureEvidenceTokens,
} from './contracts.service';

/**
 * QA agreements DEFECT-1 and DEFECT-2 (TASK-0032 WP-11), found live by WP-09.
 *
 * DEFECT-1: `generateDocument`'s preview path printed `version.contentHtml`
 * as stored, so every pre-send PDF/DOCX showed `{{platform.legalName}}`.
 *
 * DEFECT-2: the send gate exempted only SIGNATURE/INITIALS data types, so a
 * `{{signature.*.date}}` line (DATE_TIME) blocked sending, and the only
 * workaround — typing a date — froze a fabricated date into the executed copy.
 *
 * These drive the service methods themselves; a test of the pure renderer
 * alone would have passed against the unfixed `generateDocument`, which never
 * called any renderer.
 */

const platformAdmin = {
  userId: 'user-1',
  tenantId: 'platform',
  email: 'admin@example.test',
  roleIds: [],
  roleKeys: [],
  permissionKeys: ['contracts.manage', 'contracts.read'],
  platform: {
    id: 'user-1',
    role: PlatformUserRole.SUPER_ADMIN,
    status: 'ACTIVE',
  },
} as never;

/*
 * The text a reader of the PDF sees. PDFKit deflates each content stream and
 * writes standard-font text as hex strings inside TJ arrays, split wherever
 * kerning applies — so the raw bytes contain neither "Northstar" nor
 * "{{platform", and a naive `toString().includes()` would pass vacuously.
 */
function pdfText(buffer: Buffer) {
  const raw = buffer.toString('latin1');
  const pieces: string[] = [];
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamPattern.exec(raw))) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    for (const array of content.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
      pieces.push(
        [...array[1].matchAll(/<([0-9a-fA-F]*)>/g)]
          .map((hex) => Buffer.from(hex[1], 'hex').toString('latin1'))
          .join(''),
      );
    }
  }
  return pieces.join('\n');
}

async function docxText(buffer: Buffer) {
  const JSZip = (await import('jszip')).default;
  const xml = await (await JSZip.loadAsync(buffer))
    .file('word/document.xml')!
    .async('string');
  return xml.replace(/<[^>]+>/g, '');
}

const PARTNER_TEMPLATE_HTML = [
  '<h1>Individual Partner Agreement</h1>',
  '<p>{{platform.legalName}} and {{partner.name}} agree to the terms in this agreement.</p>',
  '<p>For {{platform.legalName}}: {{signature.platform.name}} &mdash; {{signature.platform.date}}</p>',
  '<p>For {{partner.name}}: {{signature.counterparty.name}} &mdash; {{signature.counterparty.date}}</p>',
].join('');

function generateHarness(input: {
  contentHtml: string;
  placeholderValues: Array<{ key: string; value: string; source: string }>;
  evidence?: unknown[];
}) {
  const saveFile = jest.fn().mockResolvedValue({
    storageKey: 'contracts/doc',
    storageProvider: 'local',
    size: 10,
  });
  const prisma = {
    contract: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'contract-1',
        tenantId: null,
        title: 'Partner Agreement',
        contractNumber: 'CON-1',
        versions: [
          {
            id: 'version-3',
            version: 3,
            contentHtml: input.contentHtml,
            contentSha256: 'abc',
          },
        ],
        placeholderValues: input.placeholderValues,
      }),
    },
    signatureEvidence: {
      findMany: jest.fn().mockResolvedValue(input.evidence ?? []),
    },
    signatureRequest: { findFirst: jest.fn().mockResolvedValue(null) },
    signatureEvent: { findMany: jest.fn().mockResolvedValue([]) },
    contractTimeline: { findMany: jest.fn().mockResolvedValue([]) },
    contractDocument: {
      create: jest.fn().mockResolvedValue({ id: 'document-1' }),
    },
  };
  const service = new ContractsService(
    prisma as never,
    {
      saveFile,
      readFileBuffer: jest.fn(),
    } as never,
    {} as never,
    { record: jest.fn().mockResolvedValue(undefined) } as never,
    { log: jest.fn().mockResolvedValue(undefined) } as never,
  );
  return { service };
}

const draftValues = [
  {
    key: 'platform.legalName',
    value: 'DijiPeople Technologies Ltd.',
    source: 'create',
  },
  { key: 'partner.name', value: 'Northstar Advisory', source: 'create' },
  /* The pre-fix workaround: a signature date typed in by hand. */
  { key: 'signature.platform.date', value: '2026-10-01', source: 'manual' },
];

describe('QA agreements DEFECT-1 — a generated preview resolves placeholders', () => {
  it('prints resolved values in the preview PDF, never {{platform.*}}', async () => {
    const { service } = generateHarness({
      contentHtml: PARTNER_TEMPLATE_HTML,
      placeholderValues: draftValues,
    });

    const { buffer } = await service.generateDocument(
      platformAdmin,
      'contract-1',
      'pdf',
    );
    const text = pdfText(buffer);

    expect(text).toContain('Northstar Advisory');
    expect(text).toContain('DijiPeople Technologies Ltd.');
    expect(text).not.toContain('{{');
    expect(text).not.toContain('undefined');
    expect(text).toContain('Pending');
    // The hand-typed signature date is not a signature and is not printed.
    expect(text).not.toContain('October 2026');
  });

  it('prints resolved values in the preview DOCX', async () => {
    const { service } = generateHarness({
      contentHtml: PARTNER_TEMPLATE_HTML,
      placeholderValues: draftValues,
    });

    const { buffer } = await service.generateDocument(
      platformAdmin,
      'contract-1',
      'docx',
    );
    const text = await docxText(buffer);

    expect(text).toContain('Northstar Advisory');
    expect(text).not.toContain('{{platform.');
    expect(text).not.toContain('{{signature.');
  });

  it('keeps a required unresolved token visible and drops an optional one', () => {
    const html = renderContractVersionHtml(
      '<p>{{partner.legalName}}|{{platform.contact.email}}|{{signature.counterparty.date}}</p>',
      [],
      'display',
    );
    // Required: left as the token the operator still has to fill.
    expect(html).toContain('{{partner.legalName}}');
    // Optional (fallback EMPTY) resolves to nothing; signature date is pending.
    expect(html).toBe('<p>{{partner.legalName}}||Pending</p>');
  });

  it('the document-fields view renders through the same function', async () => {
    const { service } = generateHarness({
      contentHtml: PARTNER_TEMPLATE_HTML,
      placeholderValues: draftValues,
    });
    jest.spyOn(service, 'get').mockResolvedValue({
      currentVersionNumber: 1,
      versions: [{ version: 1, contentHtml: PARTNER_TEMPLATE_HTML }],
      placeholderValues: draftValues,
    } as never);

    const fields = await service.documentFields(platformAdmin, 'contract-1');

    expect(fields.resolvedHtml).toBe(
      renderContractVersionHtml(PARTNER_TEMPLATE_HTML, draftValues, 'display'),
    );
    expect(fields.resolvedHtml).not.toContain('2026-10-01');
    const dateField = fields.items.find(
      (item) => item.key === 'signature.platform.date',
    );
    expect(dateField).toMatchObject({ editable: false, value: '' });
  });
});

describe('QA agreements DEFECT-1 — the executed copy stays frozen', () => {
  const signedAt = new Date('2026-09-25T10:36:10.497Z');
  const evidence = [
    {
      id: 'evidence-platform',
      method: 'TYPED',
      typedName: 'Platform Administrator',
      typedStyle: null,
      signedAt,
      signatureSha256: 'd4c15e1cd2fb26bccee662baa30cfb96',
      signatureStorageKey: null,
      eventSequence: 1,
      recipient: {
        name: 'Platform Administrator',
        email: 'platform@example.test',
        role: 'Provider',
        signingOrder: 1,
        party: { partyType: 'PLATFORM', name: 'DijiPeople', isPrimary: true },
      },
    },
    {
      id: 'evidence-partner',
      method: 'TYPED',
      typedName: 'Noura Al-Salem',
      typedStyle: null,
      signedAt: new Date('2026-09-26T08:05:00.000Z'),
      signatureSha256: '661034c5ab3ef7228346',
      signatureStorageKey: null,
      eventSequence: 2,
      recipient: {
        name: 'Noura Al-Salem',
        email: 'noura@example.test',
        role: 'Partner',
        signingOrder: 2,
        party: { partyType: 'PARTNER', name: 'Northstar', isPrimary: true },
      },
    },
  ];
  // The signing version as `sendForSignature` froze it: values resolved,
  // `signature.*` left for the evidence.
  const frozen = renderContractVersionHtml(
    PARTNER_TEMPLATE_HTML,
    draftValues,
    'freeze',
  );

  it('renders from the frozen version and evidence, not from current values', async () => {
    const { service } = generateHarness({
      contentHtml: frozen,
      // The partner was renamed after signing, and a stray date is stored.
      placeholderValues: [
        { key: 'partner.name', value: 'Renamed Holdings', source: 'derived' },
        {
          key: 'signature.platform.date',
          value: '2026-10-01',
          source: 'manual',
        },
      ],
      evidence,
    });

    const { buffer } = await service.generateDocument(
      undefined,
      'contract-1',
      'pdf',
      true,
    );
    const text = pdfText(buffer);

    expect(text).toContain('Northstar Advisory');
    expect(text).not.toContain('Renamed Holdings');
    // Each signer's real signedAt, formatted like every other date/time.
    expect(text).toContain('25 September 2026, 10:36 UTC');
    expect(text).toContain('26 September 2026, 08:05 UTC');
    expect(text).not.toContain('1 October 2026');
    expect(text).not.toContain('{{');
  });

  it('fills every field of one slot from the same signer', () => {
    const html = renderSignatureEvidenceTokens(
      '{{signature.party.primary.name}}|{{signature.party.primary.date}}|{{signature.platform.date}}',
      evidence,
    );
    expect(html).toContain('Noura Al-Salem');
    expect(html).toContain('26 September 2026, 08:05 UTC|25 September 2026');
  });

  it('a named slot with no signer reads "Not signed", never another party', () => {
    const html = renderSignatureEvidenceTokens(
      '{{signature.platform.name}}|{{signature.platform.date}}',
      [evidence[1]],
    );
    expect(html).toContain('Not signed');
    expect(html).not.toContain('Noura');
  });
});

describe('QA agreements DEFECT-2 — signature.* is resolved at signing, never before', () => {
  function sendHarness(
    placeholderValues: Array<{ key: string; value: string; source: string }>,
  ) {
    const versionCreate = jest
      .fn()
      .mockImplementation(({ data }: { data: { version: number } }) =>
        Promise.resolve({ id: 'signing-version', ...data }),
      );
    const tx = {
      contractVersion: { create: versionCreate },
      signatureRequest: {
        create: jest.fn().mockResolvedValue({
          id: 'request-1',
          requestNumber: 'SIG-1',
          signingMode: 'MIXED',
          expiresAt: new Date('2026-10-09T00:00:00Z'),
          recipients: [
            {
              id: 'recipient-1',
              signingOrder: 1,
              tokenExpiresAt: new Date('2026-10-09T00:00:00Z'),
            },
          ],
        }),
      },
      contract: { update: jest.fn().mockResolvedValue({}) },
      partner: { update: jest.fn().mockResolvedValue({}) },
      partnerTimeline: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
      contractParty: { count: jest.fn().mockResolvedValue(1) },
    };
    const service = new ContractsService(
      prisma as never,
      {} as never,
      {
        sendEmail: jest
          .fn()
          .mockResolvedValue({ status: 'SENT', recipient: 'x' }),
      } as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      { log: jest.fn().mockResolvedValue(undefined) } as never,
    );
    const internals = service as unknown as Record<string, unknown>;
    internals.contractSettings = jest.fn().mockResolvedValue({});
    internals.signatureEventTx = jest.fn().mockResolvedValue(undefined);
    internals.timelineTx = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(service, 'get').mockResolvedValue({
      id: 'contract-1',
      contractNumber: 'CON-1',
      title: 'Partner Agreement',
      contractType: ContractType.PARTNER_AGREEMENT,
      status: 'APPROVED_FOR_SENDING',
      partnerId: 'partner-1',
      relatedLeadId: null,
      customerAccountId: null,
      customerOnboardingId: null,
      tenantId: null,
      currentVersionNumber: 2,
      versions: [
        {
          version: 2,
          title: 'Partner Agreement',
          templateVersionId: null,
          contentHtml: PARTNER_TEMPLATE_HTML,
        },
      ],
      placeholderValues,
      parties: [
        {
          id: 'party-1',
          isSignatory: true,
          signatureRequired: true,
        },
      ],
    } as never);
    type FrozenVersion = {
      contentHtml: string;
      placeholderSnapshot: Record<string, string>;
    };
    const frozenVersion = () =>
      (
        versionCreate.mock.calls as unknown as Array<[{ data: FrozenVersion }]>
      )[0][0].data;
    return { service, frozenVersion };
  }

  const dto = {
    subject: 'Please sign',
    recipients: [
      {
        name: 'Noura',
        email: 'noura@example.test',
        role: 'Partner',
        partyId: 'party-1',
        signingOrder: 1,
      },
    ],
  } as never;

  const values = [
    {
      key: 'platform.legalName',
      value: 'DijiPeople Technologies Ltd.',
      source: 'create',
    },
    { key: 'partner.name', value: 'Northstar Advisory', source: 'create' },
  ];

  it('sends a template whose signature date lines are unresolved', async () => {
    const { service, frozenVersion } = sendHarness(values);

    await expect(
      service.sendForSignature(platformAdmin, 'contract-1', dto),
    ).resolves.toMatchObject({ id: 'request-1' });

    const frozen = frozenVersion().contentHtml;
    expect(frozen).toContain('Northstar Advisory');
    expect(frozen).toContain('{{signature.platform.date}}');
    expect(frozen).toContain('{{signature.counterparty.date}}');
  });

  it('never freezes a stored signature.* value into the signing version', async () => {
    const { service, frozenVersion } = sendHarness([
      ...values,
      { key: 'signature.platform.date', value: '2026-10-01', source: 'manual' },
      {
        key: 'signature.counterparty.date',
        value: '2026-10-01T00:00:00Z',
        source: 'manual',
      },
    ]);

    await service.sendForSignature(platformAdmin, 'contract-1', dto);

    const { contentHtml, placeholderSnapshot } = frozenVersion();
    expect(contentHtml).not.toContain('October 2026');
    expect(contentHtml).toContain('{{signature.platform.date}}');
    expect(Object.keys(placeholderSnapshot)).not.toContain(
      'signature.platform.date',
    );
  });

  it('refuses a manual value for a signature.* field with a clear 400', async () => {
    const { service } = sendHarness(values);

    const attempt = service.saveDocumentFields(platformAdmin, 'contract-1', {
      'signature.counterparty.date': '2026-10-01',
    });

    await expect(attempt).rejects.toThrow(BadRequestException);
    await expect(attempt).rejects.toMatchObject({
      response: { code: 'CONTRACT_SIGNATURE_FIELD_NOT_EDITABLE' },
    });
  });
});
