import { PayrollBankExportFormat } from '@prisma/client';
import {
  CsvPayrollExportProvider,
  ExcelPayrollExportProvider,
  GenericBankTransferExportProvider,
} from './payroll-export.providers';
import { ExcelExportService } from '../../common/excel/excel-export.service';

const row = {
  employeeCode: 'DP-1',
  employeeName: 'Demo Employee',
  bankName: 'Demo Bank',
  accountNumber: '001234',
  iban: 'SA001234',
  currencyCode: 'SAR',
  amount: 1250.5,
  reference: 'JUN-2026-DP-1',
};

describe('payroll export providers', () => {
  it('keeps generic CSV generation behind a provider contract', () => {
    const provider = new CsvPayrollExportProvider();
    const artifact = provider.generate([row]);

    expect(provider.format).toBe(PayrollBankExportFormat.CSV);
    expect(provider.key).toBe('generic-csv');
    expect(artifact.extension).toBe('csv');
    expect(artifact.buffer.toString()).toContain('SA001234');
  });

  it('uses a separate, extensible generic bank-transfer projection', () => {
    const provider = new GenericBankTransferExportProvider();
    const artifact = provider.generate([row]);

    expect(provider.format).toBe(PayrollBankExportFormat.GENERIC_BANK_TRANSFER);
    expect(artifact.buffer.toString().split('\n')[0]).toBe(
      'reference,employeeCode,accountNumber,iban,currencyCode,amount',
    );
  });

  it('generates a real Excel workbook with the expected row and total', () => {
    const excel = new ExcelExportService();
    const provider = new ExcelPayrollExportProvider(excel);
    const artifact = provider.generate([row]);
    const parsed = excel.parseFirstWorksheet(artifact.buffer);

    expect(provider.format).toBe(PayrollBankExportFormat.EXCEL);
    expect(artifact.extension).toBe('xlsx');
    expect(artifact.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(artifact.buffer.length).toBeGreaterThan(1000);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.values).toEqual(
      expect.objectContaining({
        'Employee Code': 'DP-1',
        Currency: 'SAR',
        Amount: '1250.5',
      }),
    );
  });
});
