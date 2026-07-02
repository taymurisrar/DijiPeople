import { createSampleInvoicePdfModel } from './invoice-pdf.fixture';
import { buildProfessionalInvoicePdf } from './invoice-pdf.template';

function pdfText(model = createSampleInvoicePdfModel()) {
  return buildProfessionalInvoicePdf(model).toString('latin1');
}

describe('buildProfessionalInvoicePdf', () => {
  it('renders default DijiPeople branding in a structured PDF', () => {
    const pdf = pdfText();

    expect(pdf).toContain('%PDF-1.4');
    expect(pdf).toContain('(DijiPeople) Tj');
    expect(pdf).toContain('(INVOICE) Tj');
    expect(pdf).toContain('(INV-20260618-7012) Tj');
    expect(pdf).toContain('(Bill From)'.toUpperCase());
    expect(pdf).toContain('(Payment Instructions) Tj');
  });

  it('renders configured platform branding and customer identity', () => {
    const pdf = pdfText(
      createSampleInvoicePdfModel({
        brand: {
          brandName: 'Maseer Workspace',
          logoText: 'MW',
          primaryColor: '#1d4ed8',
          accentColor: '#f59e0b',
          supportEmail: 'care@maseer.example',
          website: 'https://maseer.example',
          paymentInstructions:
            'Wire funds to the configured Maseer billing account.',
        },
        billTo: {
          name: 'Very Long Customer Name That Should Wrap Gracefully Limited',
          email: 'accounts@example.com',
          addressLines: [
            'Dubai Internet City',
            'Dubai',
            'United Arab Emirates',
          ],
          taxNumber: 'TRN-999',
        },
      }),
    );

    expect(pdf).toContain('(Maseer Workspace) Tj');
    expect(pdf).toContain('(https://maseer.example | care@maseer.example) Tj');
    expect(pdf).toContain('(Very Long Customer Name That Should Wrap) Tj');
    expect(pdf).toContain('(Tax/VAT/TRN: TRN-999) Tj');
  });

  it('renders a paid invoice with zero outstanding balance', () => {
    const pdf = pdfText(
      createSampleInvoicePdfModel({
        status: 'PAID',
        paid: 1380,
        outstandingBalance: 0,
        payments: [
          {
            date: new Date('2026-06-19T00:00:00.000Z'),
            method: 'CARD',
            status: 'SUCCEEDED',
            amount: 1380,
          },
        ],
      }),
    );

    expect(pdf).toContain('(PAID) Tj');
    expect(pdf).toContain('(USD 0.00) Tj');
    expect(pdf).toContain('(SUCCEEDED) Tj');
  });

  it('renders an unpaid invoice with outstanding balance', () => {
    const pdf = pdfText(
      createSampleInvoicePdfModel({
        status: 'ISSUED',
        paid: 0,
        outstandingBalance: 1380,
        payments: [],
      }),
    );

    expect(pdf).toContain('(ISSUED) Tj');
    expect(pdf).toContain('(Outstanding) Tj');
    expect(pdf).toContain('(Balance) Tj');
    expect(pdf).toContain('(USD 1,380.00) Tj');
    expect(pdf).not.toContain('(Linked Payments) Tj');
  });

  it('renders linked payments when present', () => {
    const pdf = pdfText();

    expect(pdf).toContain('(Linked Payments) Tj');
    expect(pdf).toContain('(BANK) Tj');
    expect(pdf).toContain('(PENDING) Tj');
  });

  it('omits ugly optional blanks when optional fields are missing', () => {
    const pdf = pdfText(
      createSampleInvoicePdfModel({
        brand: {
          brandName: 'DijiPeople',
          primaryColor: '#0f766e',
          accentColor: '#14b8a6',
        },
        billTo: {
          name: 'Minimal Customer',
        },
        payments: [],
        notes: null,
      }),
    );

    expect(pdf).toContain('(Minimal Customer) Tj');
    expect(pdf).not.toContain('(undefined) Tj');
    expect(pdf).not.toContain('(null) Tj');
  });
});
