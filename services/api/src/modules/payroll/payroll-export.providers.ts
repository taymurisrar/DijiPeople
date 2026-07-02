import { Injectable } from '@nestjs/common';
import { PayrollBankExportFormat } from '@prisma/client';
import { ExcelExportService } from '../../common/excel/excel-export.service';

export type PayrollExportRow = {
  employeeCode: string;
  employeeName: string;
  bankName: string;
  accountNumber: string;
  iban: string;
  currencyCode: string;
  amount: number;
  reference: string;
};

export type PayrollExportArtifact = {
  buffer: Buffer;
  contentType: string;
  extension: string;
};

export interface PayrollExportProvider {
  readonly key: string;
  readonly format: PayrollBankExportFormat;
  generate(rows: PayrollExportRow[]): PayrollExportArtifact;
}

function csv(rows: PayrollExportRow[], columns: Array<keyof PayrollExportRow>) {
  const escape = (value: unknown) =>
    `"${String(value ?? '').replaceAll('"', '""')}"`;
  return Buffer.from(
    [
      columns.join(','),
      ...rows.map((row) => columns.map((key) => escape(row[key])).join(',')),
    ].join('\n'),
    'utf8',
  );
}

@Injectable()
export class CsvPayrollExportProvider implements PayrollExportProvider {
  readonly key = 'generic-csv';
  readonly format = PayrollBankExportFormat.CSV;
  generate(rows: PayrollExportRow[]) {
    return {
      buffer: csv(rows, [
        'employeeCode',
        'employeeName',
        'bankName',
        'accountNumber',
        'iban',
        'currencyCode',
        'amount',
        'reference',
      ]),
      contentType: 'text/csv; charset=utf-8',
      extension: 'csv',
    };
  }
}

@Injectable()
export class GenericBankTransferExportProvider implements PayrollExportProvider {
  readonly key = 'generic-bank-transfer';
  readonly format = PayrollBankExportFormat.GENERIC_BANK_TRANSFER;
  generate(rows: PayrollExportRow[]) {
    return {
      buffer: csv(rows, [
        'reference',
        'employeeCode',
        'accountNumber',
        'iban',
        'currencyCode',
        'amount',
      ]),
      contentType: 'text/csv; charset=utf-8',
      extension: 'csv',
    };
  }
}

@Injectable()
export class ExcelPayrollExportProvider implements PayrollExportProvider {
  readonly key = 'generic-excel';
  readonly format = PayrollBankExportFormat.EXCEL;
  constructor(private readonly excel: ExcelExportService) {}
  generate(rows: PayrollExportRow[]) {
    return {
      buffer: this.excel.buildWorkbookBuffer({
        sheets: [
          {
            name: 'Bank Transfers',
            rows,
            columns: [
              { key: 'employeeCode', header: 'Employee Code', width: 18 },
              { key: 'employeeName', header: 'Employee', width: 28 },
              { key: 'bankName', header: 'Bank', width: 24 },
              { key: 'accountNumber', header: 'Account Number', width: 24 },
              { key: 'iban', header: 'IBAN', width: 34 },
              { key: 'currencyCode', header: 'Currency', width: 12 },
              { key: 'amount', header: 'Amount', width: 16 },
              { key: 'reference', header: 'Reference', width: 28 },
            ],
          },
        ],
      }),
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: 'xlsx',
    };
  }
}
