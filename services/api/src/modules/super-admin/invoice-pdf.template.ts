export type InvoicePdfBranding = {
  brandName: string;
  logoText?: string | null;
  primaryColor: string;
  accentColor: string;
  supportEmail?: string | null;
  website?: string | null;
  addressLines?: string[];
  footerText?: string | null;
  paymentInstructions?: string | null;
  terms?: string | null;
};

export type InvoicePdfParty = {
  name: string;
  logoText?: string | null;
  email?: string | null;
  addressLines?: string[];
  taxNumber?: string | null;
};

export type InvoicePdfLineItem = {
  description: string;
  billingPeriod?: string | null;
  quantity: number;
  unitPrice: number;
  tax: number;
  total: number;
};

export type InvoicePdfPayment = {
  date?: Date | null;
  method: string;
  status: string;
  amount: number;
};

export type InvoicePdfModel = {
  documentTitle?: string;
  fromLabel?: string;
  toLabel?: string;
  invoiceNumber: string;
  status: string;
  issueDate: Date;
  dueDate: Date;
  currency: string;
  billingPeriod?: string | null;
  subscriptionStatus?: string | null;
  generatedAt: Date;
  brand: InvoicePdfBranding;
  billFrom: InvoicePdfParty;
  billTo: InvoicePdfParty;
  lineItems: InvoicePdfLineItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  outstandingBalance: number;
  payments: InvoicePdfPayment[];
  notes?: string | null;
  summaryRows?: Array<{ label: string; value: number }>;
};

type PdfFont = 'regular' | 'bold';

type TextOptions = {
  font?: PdfFont;
  size?: number;
  color?: string;
  maxWidth?: number;
  lineHeight?: number;
  align?: 'left' | 'right' | 'center';
};

type RectOptions = {
  fill?: string;
  stroke?: string;
  width?: number;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 36;
const TEXT = '#0f172a';
const MUTED = '#64748b';
const BORDER = '#dbe3ea';
const SOFT = '#f8fafc';

export function buildProfessionalInvoicePdf(model: InvoicePdfModel) {
  const pdf = new InvoicePdfDocument();
  renderInvoice(pdf, model);
  return pdf.toBuffer();
}

export function formatInvoiceAmount(currency: string, amount: number) {
  return `${currency} ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatInvoiceDate(value?: Date | null) {
  if (!value) return '';
  return value.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  });
}

function renderInvoice(pdf: InvoicePdfDocument, model: InvoicePdfModel) {
  const brand = normalizeBranding(model.brand);
  const primary = brand.primaryColor;
  const accent = brand.accentColor;

  pdf.rect(0, 0, PAGE_WIDTH, 10, { fill: primary });
  pdf.rect(0, 10, PAGE_WIDTH, 3, { fill: accent });

  const mark = initials(brand.logoText || brand.brandName);
  pdf.rect(MARGIN, 34, 44, 44, { fill: primary });
  pdf.text(mark, MARGIN, 47, {
    font: 'bold',
    size: 17,
    color: '#ffffff',
    maxWidth: 44,
    align: 'center',
  });
  pdf.text(brand.brandName, MARGIN + 56, 35, {
    font: 'bold',
    size: 18,
    maxWidth: 245,
  });
  pdf.text(
    compact([brand.website, brand.supportEmail]).join(' | '),
    MARGIN + 56,
    58,
    {
      size: 8.5,
      color: MUTED,
      maxWidth: 260,
    },
  );

  pdf.text(model.documentTitle ?? 'INVOICE', PAGE_WIDTH - MARGIN - 165, 35, {
    font: 'bold',
    size: 24,
    color: primary,
    maxWidth: 165,
    align: 'right',
  });
  pdf.text(model.invoiceNumber, PAGE_WIDTH - MARGIN - 165, 65, {
    font: 'bold',
    size: 10,
    maxWidth: 165,
    align: 'right',
  });
  renderStatusBadge(pdf, model.status, PAGE_WIDTH - MARGIN - 96, 84);

  const cardY = 122;
  renderPartyCard(
    pdf,
    model.fromLabel ?? 'Bill From',
    model.billFrom,
    MARGIN,
    cardY,
    250,
  );
  renderPartyCard(
    pdf,
    model.toLabel ?? 'Bill To',
    model.billTo,
    PAGE_WIDTH - MARGIN - 250,
    cardY,
    250,
  );

  renderMetadata(pdf, model, 249);

  const tableY = 354;
  renderLineItems(pdf, model, tableY);

  const afterRows = tableY + 35 + Math.max(model.lineItems.length, 1) * 36;
  renderPaymentInstructions(pdf, model, MARGIN, afterRows + 22, 300);
  renderTotals(pdf, model, PAGE_WIDTH - MARGIN - 190, afterRows + 22, 190);

  const paymentsY = afterRows + 170;
  if (model.payments.length) {
    renderPayments(pdf, model, paymentsY);
  }

  renderFooter(pdf, model);
}

function renderPartyCard(
  pdf: InvoicePdfDocument,
  title: string,
  party: InvoicePdfParty,
  x: number,
  y: number,
  width: number,
) {
  pdf.rect(x, y, width, 92, { fill: '#ffffff', stroke: BORDER });
  pdf.text(title.toUpperCase(), x + 14, y + 13, {
    font: 'bold',
    size: 8,
    color: MUTED,
    maxWidth: width - 28,
  });
  let textX = x + 14;
  let textWidth = width - 28;
  let cursor = y + 31;
  if (party.logoText) {
    pdf.rect(x + 14, cursor - 1, 28, 28, { fill: SOFT, stroke: BORDER });
    pdf.text(initials(party.logoText), x + 14, cursor + 8, {
      font: 'bold',
      size: 9,
      color: TEXT,
      maxWidth: 28,
      align: 'center',
    });
    textX += 38;
    textWidth -= 38;
  }
  cursor += pdf.text(party.name, textX, cursor, {
    font: 'bold',
    size: 11,
    maxWidth: textWidth,
    lineHeight: 12,
  });
  for (const line of compact([
    party.email,
    ...(party.addressLines ?? []),
    party.taxNumber ? `Tax/VAT/TRN: ${party.taxNumber}` : null,
  ])) {
    cursor += pdf.text(line, textX, cursor + 2, {
      size: 8.2,
      color: MUTED,
      maxWidth: textWidth,
      lineHeight: 10,
    });
  }
}

function renderMetadata(
  pdf: InvoicePdfDocument,
  model: InvoicePdfModel,
  y: number,
) {
  const items = [
    ['Issue Date', formatInvoiceDate(model.issueDate)],
    ['Due Date', formatInvoiceDate(model.dueDate)],
    ['Billing Period', model.billingPeriod || 'Current period'],
    ['Currency', model.currency],
    ['Subscription', model.subscriptionStatus || 'Not specified'],
  ];
  const width = (PAGE_WIDTH - MARGIN * 2 - 32) / 5;
  items.forEach(([label, value], index) => {
    const x = MARGIN + index * (width + 8);
    pdf.rect(x, y, width, 70, { fill: SOFT, stroke: BORDER });
    pdf.text(label.toUpperCase(), x + 10, y + 13, {
      font: 'bold',
      size: 7.2,
      color: MUTED,
      maxWidth: width - 20,
    });
    pdf.text(value, x + 10, y + 33, {
      font: 'bold',
      size: 9.2,
      maxWidth: width - 20,
      lineHeight: 10.5,
    });
  });
}

function renderLineItems(
  pdf: InvoicePdfDocument,
  model: InvoicePdfModel,
  y: number,
) {
  const widths = [188, 98, 46, 78, 56, 82];
  const xs = widths.reduce<number[]>(
    (acc, width, index) => [
      ...acc,
      index === 0 ? MARGIN : acc[index - 1] + widths[index - 1],
    ],
    [],
  );
  const labels = [
    'Description',
    'Billing Period',
    'Qty',
    'Unit Price',
    'Tax',
    'Total',
  ];

  pdf.text('Line Items', MARGIN, y - 22, { font: 'bold', size: 13 });
  pdf.rect(MARGIN, y, PAGE_WIDTH - MARGIN * 2, 28, { fill: '#eaf7f4' });
  labels.forEach((label, index) => {
    pdf.text(label, xs[index] + 8, y + 10, {
      font: 'bold',
      size: 8,
      color: TEXT,
      maxWidth: widths[index] - 16,
      align: index >= 2 ? 'right' : 'left',
    });
  });

  const rows = model.lineItems.length
    ? model.lineItems
    : [
        {
          description: 'Subscription charges',
          billingPeriod: model.billingPeriod,
          quantity: 1,
          unitPrice: model.subtotal,
          tax: model.tax,
          total: model.total,
        },
      ];

  rows.forEach((item, rowIndex) => {
    const rowY = y + 28 + rowIndex * 36;
    pdf.rect(MARGIN, rowY, PAGE_WIDTH - MARGIN * 2, 36, {
      fill: rowIndex % 2 === 0 ? '#ffffff' : SOFT,
      stroke: BORDER,
    });
    const values = [
      item.description,
      item.billingPeriod || '-',
      String(item.quantity),
      formatInvoiceAmount(model.currency, item.unitPrice),
      formatInvoiceAmount(model.currency, item.tax),
      formatInvoiceAmount(model.currency, item.total),
    ];
    values.forEach((value, index) => {
      pdf.text(value, xs[index] + 8, rowY + 10, {
        size: index === 0 ? 8.7 : 8,
        font: index === 0 || index === 5 ? 'bold' : 'regular',
        color: index === 1 ? MUTED : TEXT,
        maxWidth: widths[index] - 16,
        lineHeight: 9.5,
        align: index >= 2 ? 'right' : 'left',
      });
    });
  });
}

function renderTotals(
  pdf: InvoicePdfDocument,
  model: InvoicePdfModel,
  x: number,
  y: number,
  width: number,
) {
  const rows: Array<[string, number]> = model.summaryRows?.length
    ? model.summaryRows.map((row) => [row.label, row.value])
    : [
        ['Subtotal', model.subtotal],
        ['Discount', -Math.abs(model.discount)],
        ['Tax', model.tax],
        ['Total', model.total],
        ['Paid', -Math.abs(model.paid)],
        ['Outstanding Balance', model.outstandingBalance],
      ];
  pdf.rect(x, y, width, 136, { fill: '#ffffff', stroke: BORDER });
  rows.forEach(([label, amount], index) => {
    const rowY = y + 14 + index * 19;
    const isFinal = index === rows.length - 1;
    if (isFinal) {
      pdf.rect(x, rowY - 5, width, 24, { fill: SOFT });
    }
    pdf.text(String(label), x + 14, rowY, {
      font: isFinal ? 'bold' : 'regular',
      size: isFinal ? 9.5 : 8.4,
      color: isFinal ? TEXT : MUTED,
      maxWidth: 82,
    });
    pdf.text(
      formatInvoiceAmount(model.currency, Number(amount)),
      x + 82,
      rowY,
      {
        font: isFinal ? 'bold' : 'regular',
        size: isFinal ? 9.5 : 8.4,
        color: isFinal ? TEXT : MUTED,
        maxWidth: width - 96,
        align: 'right',
      },
    );
  });
}

function renderPaymentInstructions(
  pdf: InvoicePdfDocument,
  model: InvoicePdfModel,
  x: number,
  y: number,
  width: number,
) {
  pdf.rect(x, y, width, 136, { fill: '#ffffff', stroke: BORDER });
  pdf.text('Payment Instructions', x + 14, y + 14, {
    font: 'bold',
    size: 11,
    maxWidth: width - 28,
  });
  pdf.text(
    model.brand.paymentInstructions ||
      'Please pay this invoice according to the payment terms in your platform agreement.',
    x + 14,
    y + 34,
    { size: 8.7, color: MUTED, maxWidth: width - 28, lineHeight: 11 },
  );
  const support = compact([
    model.brand.supportEmail ? `Support: ${model.brand.supportEmail}` : null,
    model.brand.website ? `Website: ${model.brand.website}` : null,
  ]).join(' | ');
  if (support) {
    pdf.text(support, x + 14, y + 96, {
      font: 'bold',
      size: 8.4,
      color: TEXT,
      maxWidth: width - 28,
      lineHeight: 10,
    });
  }
}

function renderPayments(
  pdf: InvoicePdfDocument,
  model: InvoicePdfModel,
  y: number,
) {
  pdf.text('Linked Payments', MARGIN, y - 18, { font: 'bold', size: 12 });
  pdf.rect(MARGIN, y, PAGE_WIDTH - MARGIN * 2, 24, {
    fill: SOFT,
    stroke: BORDER,
  });
  const headers = ['Date', 'Method', 'Status', 'Amount'];
  const widths = [130, 130, 130, 173];
  const xs = [MARGIN, MARGIN + 130, MARGIN + 260, MARGIN + 390];
  headers.forEach((header, index) => {
    pdf.text(header, xs[index] + 8, y + 8, {
      font: 'bold',
      size: 8,
      color: MUTED,
      maxWidth: widths[index] - 16,
      align: index === 3 ? 'right' : 'left',
    });
  });

  model.payments.slice(0, 5).forEach((payment, index) => {
    const rowY = y + 24 + index * 24;
    pdf.rect(MARGIN, rowY, PAGE_WIDTH - MARGIN * 2, 24, {
      fill: index % 2 === 0 ? '#ffffff' : SOFT,
      stroke: BORDER,
    });
    const values = [
      formatInvoiceDate(payment.date),
      payment.method,
      payment.status,
      formatInvoiceAmount(model.currency, payment.amount),
    ];
    values.forEach((value, col) => {
      pdf.text(value || '-', xs[col] + 8, rowY + 8, {
        size: 8,
        maxWidth: widths[col] - 16,
        align: col === 3 ? 'right' : 'left',
      });
    });
  });
}

function renderFooter(pdf: InvoicePdfDocument, model: InvoicePdfModel) {
  const y = PAGE_HEIGHT - 58;
  pdf.line(MARGIN, y - 10, PAGE_WIDTH - MARGIN, y - 10, BORDER);
  const footer = compact([
    'Generated electronically by DijiPeople. No signature required.',
    `Generated ${model.generatedAt.toISOString()}`,
    model.brand.footerText,
    model.brand.terms || model.notes,
  ]).join('  ');
  pdf.text(footer, MARGIN, y, {
    size: 7.5,
    color: MUTED,
    maxWidth: PAGE_WIDTH - MARGIN * 2,
    lineHeight: 9,
    align: 'center',
  });
}

function renderStatusBadge(
  pdf: InvoicePdfDocument,
  status: string,
  x: number,
  y: number,
) {
  const color = statusColor(status);
  pdf.rect(x, y, 96, 23, { fill: color });
  pdf.text(status.replace(/_/g, ' '), x, y + 7, {
    font: 'bold',
    size: 8,
    color: '#ffffff',
    maxWidth: 96,
    align: 'center',
  });
}

function normalizeBranding(brand: InvoicePdfBranding): InvoicePdfBranding {
  return {
    ...brand,
    brandName: clean(brand.brandName) || 'DijiPeople',
    primaryColor: normalizeHex(brand.primaryColor, '#0f766e'),
    accentColor: normalizeHex(brand.accentColor, '#14b8a6'),
  };
}

function statusColor(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === 'PAID') return '#16a34a';
  if (normalized === 'OVERDUE' || normalized === 'PAYMENT_FAILED')
    return '#dc2626';
  if (
    normalized === 'VOIDED' ||
    normalized === 'CANCELLED' ||
    normalized === 'CANCELED'
  ) {
    return '#64748b';
  }
  if (normalized === 'DRAFT') return '#475569';
  return '#0f766e';
}

function compact(values: Array<string | null | undefined>) {
  return values.map(clean).filter(Boolean) as string[];
}

function clean(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function initials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return (
    words.length > 1 ? words[0][0] + words[1][0] : value.slice(0, 2)
  ).toUpperCase();
}

function normalizeHex(value: string | null | undefined, fallback: string) {
  const candidate = value?.trim();
  if (!candidate) return fallback;
  return /^#[0-9A-Fa-f]{6}$/.test(candidate) ? candidate : fallback;
}

class InvoicePdfDocument {
  private readonly operations: string[] = [];

  rect(
    x: number,
    y: number,
    width: number,
    height: number,
    options: RectOptions = {},
  ) {
    const pdfY = PAGE_HEIGHT - y - height;
    this.operations.push('q');
    if (options.fill) this.operations.push(`${rgb(options.fill)} rg`);
    if (options.stroke)
      this.operations.push(
        `${rgb(options.stroke)} RG ${options.width ?? 0.8} w`,
      );
    this.operations.push(`${n(x)} ${n(pdfY)} ${n(width)} ${n(height)} re`);
    this.operations.push(
      options.fill && options.stroke ? 'B' : options.fill ? 'f' : 'S',
    );
    this.operations.push('Q');
  }

  line(x1: number, y1: number, x2: number, y2: number, color = BORDER) {
    this.operations.push(
      `q ${rgb(color)} RG 0.8 w ${n(x1)} ${n(PAGE_HEIGHT - y1)} m ${n(x2)} ${n(
        PAGE_HEIGHT - y2,
      )} l S Q`,
    );
  }

  text(value: string, x: number, y: number, options: TextOptions = {}) {
    const size = options.size ?? 9;
    const lineHeight = options.lineHeight ?? size * 1.25;
    const maxWidth = options.maxWidth ?? 220;
    const lines = wrapText(value, maxWidth, size);
    lines.forEach((line, index) => {
      const textWidth = estimateWidth(line, size);
      const offset =
        options.align === 'right'
          ? Math.max(0, maxWidth - textWidth)
          : options.align === 'center'
            ? Math.max(0, (maxWidth - textWidth) / 2)
            : 0;
      this.operations.push('BT');
      this.operations.push(`${rgb(options.color ?? TEXT)} rg`);
      this.operations.push(
        `/${options.font === 'bold' ? 'F2' : 'F1'} ${n(size)} Tf`,
      );
      this.operations.push(
        `${n(x + offset)} ${n(PAGE_HEIGHT - y - size - index * lineHeight)} Td`,
      );
      this.operations.push(`(${escapePdfText(line)}) Tj`);
      this.operations.push('ET');
    });
    return Math.max(lineHeight, lines.length * lineHeight);
  }

  toBuffer() {
    const content = this.operations.join('\n');
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (const [index, object] of objects.entries()) {
      offsets.push(Buffer.byteLength(pdf));
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    }
    const xrefOffset = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (const offset of offsets.slice(1)) {
      pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    return Buffer.from(pdf, 'latin1');
  }
}

function wrapText(value: string, maxWidth: number, size: number) {
  const words = String(value || '-')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (estimateWidth(candidate, size) <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ['-'];
}

function estimateWidth(value: string, size: number) {
  return value.length * size * 0.48;
}

function rgb(hex: string) {
  const normalized = normalizeHex(hex, '#000000').slice(1);
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  return `${n(r)} ${n(g)} ${n(b)}`;
}

function n(value: number) {
  return Number(value.toFixed(3)).toString();
}

function escapePdfText(value: string) {
  return value
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}
