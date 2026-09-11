import type { SecretEncryptionService } from './secret-encryption.service';

/**
 * OBS-24 expand-phase codec: dual-write plaintext + AES-256-GCM ciphertext for
 * employee/payroll PII (bank accounts, IBANs, SWIFT/routing codes, national
 * and tax identifiers), and decrypt the ciphertext column back onto the same
 * plaintext field name so no caller — controller, DTO mapper, audit snapshot,
 * export — has to change shape.
 *
 * Every `encrypt*Fields` function only ever ADDS the `*Enc` (and, for CNIC,
 * `*Hmac`) columns to whatever plaintext fields the caller is already
 * writing. It never removes or overrides the plaintext columns themselves —
 * that dual-write is the whole point of the expand phase (PLANS.md,
 * EXECPLAN-0032): the plaintext columns stay authoritative and every existing
 * reader keeps working, unmodified, until the contract migration removes them
 * in a later, separate task.
 *
 * Every `decrypt*Fields` function is the read-side mirror: given a fetched
 * row, it overwrites the plaintext field with the decrypted ciphertext when
 * the ciphertext column is populated (a row already migrated by the
 * production backfill script or written after this deploy), and otherwise
 * leaves the existing plaintext value untouched (a row not yet backfilled).
 * It always strips the raw `*Enc`/`*Hmac` columns from the object it returns,
 * so the shape callers see is identical to before this change — nobody
 * downstream needs to know the ciphertext columns exist.
 *
 * Nothing here logs a field value. A caller that logs the *returned* object
 * wholesale would still log the decrypted plaintext — that risk already
 * exists for the plaintext-only shape today and is unchanged by this file;
 * see the "Sensitive data exposure" rule in AGENTS.md.
 */

type Codec = Pick<SecretEncryptionService, 'encrypt' | 'decrypt' | 'hmac'>;

function encryptOrNull(codec: Codec, value: string | null | undefined) {
  if (value === undefined) return undefined; // caller isn't touching this field
  if (value === null || value === '') return null;
  return codec.encrypt(value);
}

function decryptOrKeep(
  codec: Codec,
  ciphertext: string | null | undefined,
  currentPlaintext: string | null,
): string | null {
  if (!ciphertext) return currentPlaintext;
  return codec.decrypt(ciphertext);
}

// ---------------------------------------------------------------------------
// EmployeeBankAccount.{accountNumber,iban,swiftOrRoutingCode}
// ---------------------------------------------------------------------------

export interface EmployeeBankAccountPlainFields {
  accountNumber?: string | null;
  iban?: string | null;
  swiftOrRoutingCode?: string | null;
}

export function encryptEmployeeBankAccountFields(
  codec: Codec,
  data: EmployeeBankAccountPlainFields,
) {
  return {
    accountNumberEnc: encryptOrNull(codec, data.accountNumber),
    ibanEnc: encryptOrNull(codec, data.iban),
    swiftOrRoutingCodeEnc: encryptOrNull(codec, data.swiftOrRoutingCode),
  };
}

export function decryptEmployeeBankAccountFields<
  T extends {
    accountNumber: string | null;
    iban: string | null;
    swiftOrRoutingCode: string | null;
    accountNumberEnc?: string | null;
    ibanEnc?: string | null;
    swiftOrRoutingCodeEnc?: string | null;
  },
>(codec: Codec, row: T): Omit<T, 'accountNumberEnc' | 'ibanEnc' | 'swiftOrRoutingCodeEnc'> {
  const {
    accountNumberEnc,
    ibanEnc,
    swiftOrRoutingCodeEnc,
    ...rest
  } = row;
  return {
    ...rest,
    accountNumber: decryptOrKeep(codec, accountNumberEnc, row.accountNumber),
    iban: decryptOrKeep(codec, ibanEnc, row.iban),
    swiftOrRoutingCode: decryptOrKeep(
      codec,
      swiftOrRoutingCodeEnc,
      row.swiftOrRoutingCode,
    ),
  } as Omit<T, 'accountNumberEnc' | 'ibanEnc' | 'swiftOrRoutingCodeEnc'>;
}

// ---------------------------------------------------------------------------
// EmployerBankAccount.{accountNumber,iban}
// ---------------------------------------------------------------------------

export interface EmployerBankAccountPlainFields {
  accountNumber?: string | null;
  iban?: string | null;
}

export function encryptEmployerBankAccountFields(
  codec: Codec,
  data: EmployerBankAccountPlainFields,
) {
  return {
    accountNumberEnc: encryptOrNull(codec, data.accountNumber),
    ibanEnc: encryptOrNull(codec, data.iban),
  };
}

export function decryptEmployerBankAccountFields<
  T extends {
    accountNumber: string | null;
    iban: string | null;
    accountNumberEnc?: string | null;
    ibanEnc?: string | null;
  },
>(codec: Codec, row: T): Omit<T, 'accountNumberEnc' | 'ibanEnc'> {
  const { accountNumberEnc, ibanEnc, ...rest } = row;
  return {
    ...rest,
    accountNumber: decryptOrKeep(codec, accountNumberEnc, row.accountNumber),
    iban: decryptOrKeep(codec, ibanEnc, row.iban),
  } as Omit<T, 'accountNumberEnc' | 'ibanEnc'>;
}

// ---------------------------------------------------------------------------
// EmployeeCompensation.{bankAccountNumber,bankIban,bankRoutingNumber,taxIdentifier}
// ---------------------------------------------------------------------------

export interface EmployeeCompensationPlainFields {
  bankAccountNumber?: string | null;
  bankIban?: string | null;
  bankRoutingNumber?: string | null;
  taxIdentifier?: string | null;
}

export function encryptEmployeeCompensationFields(
  codec: Codec,
  data: EmployeeCompensationPlainFields,
) {
  return {
    bankAccountNumberEnc: encryptOrNull(codec, data.bankAccountNumber),
    bankIbanEnc: encryptOrNull(codec, data.bankIban),
    bankRoutingNumberEnc: encryptOrNull(codec, data.bankRoutingNumber),
    taxIdentifierEnc: encryptOrNull(codec, data.taxIdentifier),
  };
}

export function decryptEmployeeCompensationFields<
  T extends {
    bankAccountNumber: string | null;
    bankIban: string | null;
    bankRoutingNumber: string | null;
    taxIdentifier: string | null;
    bankAccountNumberEnc?: string | null;
    bankIbanEnc?: string | null;
    bankRoutingNumberEnc?: string | null;
    taxIdentifierEnc?: string | null;
  },
>(
  codec: Codec,
  row: T,
): Omit<
  T,
  | 'bankAccountNumberEnc'
  | 'bankIbanEnc'
  | 'bankRoutingNumberEnc'
  | 'taxIdentifierEnc'
> {
  const {
    bankAccountNumberEnc,
    bankIbanEnc,
    bankRoutingNumberEnc,
    taxIdentifierEnc,
    ...rest
  } = row;
  return {
    ...rest,
    bankAccountNumber: decryptOrKeep(
      codec,
      bankAccountNumberEnc,
      row.bankAccountNumber,
    ),
    bankIban: decryptOrKeep(codec, bankIbanEnc, row.bankIban),
    bankRoutingNumber: decryptOrKeep(
      codec,
      bankRoutingNumberEnc,
      row.bankRoutingNumber,
    ),
    taxIdentifier: decryptOrKeep(codec, taxIdentifierEnc, row.taxIdentifier),
  } as Omit<
    T,
    | 'bankAccountNumberEnc'
    | 'bankIbanEnc'
    | 'bankRoutingNumberEnc'
    | 'taxIdentifierEnc'
  >;
}

// ---------------------------------------------------------------------------
// EmployeeTaxProfile.taxIdentificationNumber
// ---------------------------------------------------------------------------

export function encryptEmployeeTaxProfileFields(
  codec: Codec,
  data: { taxIdentificationNumber?: string | null },
) {
  return {
    taxIdentificationNumberEnc: encryptOrNull(
      codec,
      data.taxIdentificationNumber,
    ),
  };
}

export function decryptEmployeeTaxProfileFields<
  T extends {
    taxIdentificationNumber: string | null;
    taxIdentificationNumberEnc?: string | null;
  },
>(codec: Codec, row: T): Omit<T, 'taxIdentificationNumberEnc'> {
  const { taxIdentificationNumberEnc, ...rest } = row;
  return {
    ...rest,
    taxIdentificationNumber: decryptOrKeep(
      codec,
      taxIdentificationNumberEnc,
      row.taxIdentificationNumber,
    ),
  } as Omit<T, 'taxIdentificationNumberEnc'>;
}

// ---------------------------------------------------------------------------
// Employee.{cnic,taxIdentifier}
//
// cnic additionally carries a deterministic HMAC (`cnicHmac`) so the
// per-tenant uniqueness check can move off the plaintext column — AES-256-GCM
// is non-deterministic, so the ciphertext itself cannot back a unique index.
// ---------------------------------------------------------------------------

export interface EmployeeSensitiveFields {
  cnic?: string | null;
  taxIdentifier?: string | null;
}

export function encryptEmployeeSensitiveFields(
  codec: Codec,
  data: EmployeeSensitiveFields,
) {
  return {
    cnicEnc: encryptOrNull(codec, data.cnic),
    cnicHmac:
      data.cnic === undefined
        ? undefined
        : data.cnic === null || data.cnic === ''
          ? null
          : codec.hmac(data.cnic),
    taxIdentifierEnc: encryptOrNull(codec, data.taxIdentifier),
  };
}

export function decryptEmployeeSensitiveFields<
  T extends {
    cnic: string | null;
    taxIdentifier: string | null;
    cnicEnc?: string | null;
    cnicHmac?: string | null;
    taxIdentifierEnc?: string | null;
  },
>(
  codec: Codec,
  row: T,
): Omit<T, 'cnicEnc' | 'cnicHmac' | 'taxIdentifierEnc'> {
  const { cnicEnc, cnicHmac: _cnicHmac, taxIdentifierEnc, ...rest } = row;
  return {
    ...rest,
    cnic: decryptOrKeep(codec, cnicEnc, row.cnic),
    taxIdentifier: decryptOrKeep(codec, taxIdentifierEnc, row.taxIdentifier),
  } as Omit<T, 'cnicEnc' | 'cnicHmac' | 'taxIdentifierEnc'>;
}
