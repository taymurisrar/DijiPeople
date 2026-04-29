export type ClaimTypeRecord = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  subTypes?: ClaimSubTypeRecord[];
};

export type ClaimSubTypeRecord = {
  id: string;
  claimTypeId: string;
  code: string;
  name: string;
  description?: string | null;
  requiresReceipt: boolean;
  isActive: boolean;
};

export type ClaimRecord = {
  id: string;
  employeeId: string;
  status: string;
  title: string;
  description?: string | null;
  submittedAmount: string;
  approvedAmount: string;
  currencyCode: string;
  submittedAt?: string | null;
  employee?: {
    employeeCode: string;
    firstName: string;
    lastName: string;
  };
  lineItems: ClaimLineItemRecord[];
};

export type ClaimLineItemRecord = {
  id: string;
  claimTypeId: string;
  claimSubTypeId?: string | null;
  transactionDate: string;
  vendor?: string | null;
  description?: string | null;
  amount: string;
  approvedAmount?: string | null;
  currencyCode: string;
  payrollRunEmployeeId?: string | null;
  claimType?: ClaimTypeRecord;
  claimSubType?: ClaimSubTypeRecord | null;
};
