import { AuditService } from './audit.service';
import { isSensitiveAuditKey, redactAuditSnapshot } from './audit-snapshot';
import type { AuditRepository } from './audit.repository';

/**
 * BUG-2044 — the snapshots this fix adds cover personal data.
 *
 * `AGENTS.md` forbids full national ids and bank details from leaving a service
 * in a log, and an audit row is the longest-lived log the product keeps. The
 * redaction runs centrally in `AuditService.log()` rather than at each call
 * site, because a call site is exactly what gets forgotten — which is the whole
 * shape of BUG-2044.
 */
describe('audit snapshot redaction', () => {
  it('redacts a national id and a tax identifier from an employee snapshot', () => {
    expect(
      redactAuditSnapshot({
        id: 'employee-1',
        firstName: 'Ada',
        cnic: '42101-1234567-8',
        taxIdentifier: 'TAX-99881',
      }),
    ).toEqual({
      id: 'employee-1',
      firstName: 'Ada',
      cnic: '[REDACTED]',
      taxIdentifier: '[REDACTED]',
    });
  });

  it('redacts bank details nested inside a snapshot', () => {
    expect(
      redactAuditSnapshot({
        employeeId: 'employee-1',
        bankAccounts: [
          {
            accountTitle: 'Ada Lovelace',
            accountNumber: '000123456789',
            iban: 'PK36SCBL0000001123456702',
            swiftOrRoutingCode: 'SCBLPKKX',
            bankName: 'Standard Chartered',
          },
        ],
      }),
    ).toEqual({
      employeeId: 'employee-1',
      bankAccounts: [
        {
          accountTitle: 'Ada Lovelace',
          accountNumber: '[REDACTED]',
          iban: '[REDACTED]',
          swiftOrRoutingCode: '[REDACTED]',
          bankName: 'Standard Chartered',
        },
      ],
    });
  });

  it('redacts credentials the way sanitizeForErrorLog does', () => {
    expect(
      redactAuditSnapshot({
        passwordHash: 'argon2id$v=19$...',
        refreshToken: 'rt_live_abc',
        apiKey: 'sk_live_abc',
        clientSecret: 'cs_live_abc',
      }),
    ).toEqual({
      passwordHash: '[REDACTED]',
      refreshToken: '[REDACTED]',
      apiKey: '[REDACTED]',
      clientSecret: '[REDACTED]',
    });
  });

  it('keeps the fields an audit trail exists to record', () => {
    /*
     * Money is deliberately not redacted. A compensation change is precisely
     * what an auditor opens the log to find, and a substring match on "account"
     * would take the bank's name and the accounting code with it.
     */
    const snapshot = {
      basicSalary: 120000,
      currencyCode: 'QAR',
      accountTitle: 'Payroll',
      accountingCode: 'ACC-100',
      bankAccountId: 'bank-account-1',
      departmentId: 'department-1',
    };

    expect(redactAuditSnapshot(snapshot)).toEqual(snapshot);
  });

  it('leaves the auth fields the audit screen projects out of the snapshot', () => {
    /*
     * `mapAuditLogItem` reads result, ipAddress, appClientId, sessionId,
     * userAgent, failureReason and mfaResult back out of `afterSnapshot`.
     * Redacting any of them would blank the Login History screen.
     */
    const snapshot = {
      result: 'SUCCESS',
      ipAddress: '203.0.113.7',
      appClientId: 'web',
      sessionId: 'session-1',
      userAgent: 'Mozilla/5.0',
      mfaResult: 'NOT_REQUIRED',
      failureReason: null,
    };

    expect(redactAuditSnapshot(snapshot)).toEqual(snapshot);
  });

  it('matches a sensitive key however it is punctuated or cased', () => {
    expect(isSensitiveAuditKey('national_id')).toBe(true);
    expect(isSensitiveAuditKey('NationalId')).toBe(true);
    expect(isSensitiveAuditKey('bank_account_number')).toBe(true);
    expect(isSensitiveAuditKey('bankName')).toBe(false);
  });

  it('redacts on the way into the database, not only in the helper', async () => {
    /*
     * The mutation that matters: `AuditService.log()` must apply this before
     * the row is written. The existing EMPLOYEE_UPDATED writer passes
     * `mapEmployee()` straight through, so without this the CNIC of every
     * edited employee lands in AuditLog.
     */
    const create = jest.fn().mockResolvedValue({ id: 'audit-1' });
    const repository = {
      findTenantActor: jest.fn().mockResolvedValue({ id: 'user-1' }),
      findPlatformActor: jest.fn(),
      create,
    } as unknown as AuditRepository;

    await new AuditService(repository).log({
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      action: 'EMPLOYEE_UPDATED',
      entityType: 'Employee',
      entityId: 'employee-1',
      beforeSnapshot: { id: 'employee-1', cnic: '42101-1234567-8' },
      afterSnapshot: { id: 'employee-1', cnic: '42101-7654321-8' },
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        beforeSnapshot: { id: 'employee-1', cnic: '[REDACTED]' },
        afterSnapshot: { id: 'employee-1', cnic: '[REDACTED]' },
      }),
    );
  });
});
