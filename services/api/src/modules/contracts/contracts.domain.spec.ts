import {
  cleanContractHtml,
  convertContractDocumentToHtml,
  decodeSignatureDataUrl,
  extractAgreementDocumentStructure,
  extractContractPlaceholders,
  renderContractPlaceholders,
  validateContractPlaceholderValues,
} from './contracts.service';
import {
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from 'docx';

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

  it('preserves headings, nested lists, and table rows for generated files', () => {
    expect(
      extractAgreementDocumentStructure(
        '<h2>Commercial terms</h2><ol><li>First<ul><li>Nested</li></ul></li></ol><table><thead><tr><th>Item</th><th>Value</th></tr></thead><tbody><tr><td>Seats</td><td>25</td></tr></tbody></table>',
      ),
    ).toEqual([
      { kind: 'paragraph', text: 'Commercial terms', level: 2 },
      { kind: 'list', text: 'First', depth: 0, ordered: true, index: 1 },
      { kind: 'list', text: 'Nested', depth: 1, ordered: false, index: 1 },
      {
        kind: 'table',
        rows: [
          ['Item', 'Value'],
          ['Seats', '25'],
        ],
      },
    ]);
  });

  it('preserves an embedded signature image at its document placeholder', () => {
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    const blocks = extractAgreementDocumentStructure(
      `<p>Signed by:</p><img src="data:image/png;base64,${pixel.toString('base64')}" alt="Signer signature"><p>Verified</p>`,
    );
    expect(blocks[1]).toEqual({
      kind: 'image',
      data: pixel,
      imageType: 'png',
      alt: 'Signer signature',
    });
  });

  it('imports DOCX structure, page breaks, table semantics, and images', async () => {
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    const source = new Document({
      sections: [
        {
          children: [
            new Table({
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({ text: 'DIJIPEOPLE', bold: true }),
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({ text: 'Customer rollout plan', bold: true }),
              ],
            }),
            new Paragraph({ text: 'Prepared for delivery' }),
            new Paragraph({
              text: 'Scope',
              heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph({ text: 'First requirement', bullet: { level: 0 } }),
            new Paragraph({ text: '1. Prepare the source data' }),
            new Paragraph({ text: '2. Validate the source data' }),
            new Table({
              rows: [
                new TableRow({
                  children: ['Item', 'Owner'].map(
                    (text) =>
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [new TextRun({ text, bold: true })],
                          }),
                        ],
                      }),
                  ),
                }),
                new TableRow({
                  children: ['Configuration', 'HR'].map(
                    (text) =>
                      new TableCell({
                        children: [new Paragraph({ text })],
                      }),
                  ),
                }),
              ],
            }),
            new Paragraph({ children: [new PageBreak()] }),
            new Paragraph({
              children: [
                new ImageRun({
                  data: pixel,
                  transformation: { width: 1, height: 1 },
                  type: 'png',
                }),
              ],
            }),
          ],
        },
      ],
    });
    const buffer = await Packer.toBuffer(source);
    const result = await convertContractDocumentToHtml({
      buffer,
      originalname: 'rollout.docx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: buffer.length,
    });

    expect(result.html).toContain('data-document-role="brand"');
    expect(result.html).toContain('data-document-role="cover-title"');
    expect(result.html).toContain('<h1>Scope</h1>');
    expect(result.html).toContain('<ul>');
    expect(result.html).toContain('<ol>');
    expect(result.html).toContain('<th>');
    expect(result.html).toContain('data-page-break="true"');
    expect(result.html).toContain('<img src="data:image/png;base64,');
  });

  it('accepts raster signature bytes and rejects disguised uploads', () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    expect(
      decodeSignatureDataUrl(`data:image/png;base64,${png.toString('base64')}`),
    ).toEqual(png);
    expect(() =>
      decodeSignatureDataUrl(
        `data:image/png;base64,${Buffer.from('<svg onload="alert(1)"></svg>').toString('base64')}`,
      ),
    ).toThrow(/valid PNG or JPEG/i);
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
