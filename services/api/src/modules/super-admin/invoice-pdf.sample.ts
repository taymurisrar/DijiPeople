import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildProfessionalInvoicePdf } from './invoice-pdf.template';
import { createSampleInvoicePdfModel } from './invoice-pdf.fixture';

async function main() {
  const outputPath = path.resolve(
    process.cwd(),
    'storage',
    'generated',
    'samples',
    'sample-professional-invoice.pdf',
  );
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    buildProfessionalInvoicePdf(createSampleInvoicePdfModel()),
  );

  console.log(`Sample invoice PDF generated: ${outputPath}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
