export type BusinessTripRecord = {
  id: string;
  employeeId: string;
  title: string;
  purpose?: string | null;
  originCountry?: string | null;
  originCity?: string | null;
  destinationCountry: string;
  destinationCity: string;
  startDate: string;
  endDate: string;
  status: string;
  currencyCode: string;
  estimatedAllowance: string;
  approvedAllowance: string;
  employee?: {
    employeeCode: string;
    firstName: string;
    lastName: string;
    employeeLevelId?: string | null;
  };
  allowances: BusinessTripAllowanceRecord[];
  approvals?: BusinessTripApprovalRecord[];
};

export type BusinessTripAllowanceRecord = {
  id: string;
  allowanceType: string;
  calculationBasis: string;
  quantity: string;
  rate: string;
  amount: string;
  currencyCode: string;
  payrollRunEmployeeId?: string | null;
};

export type BusinessTripApprovalRecord = {
  id: string;
  status: string;
  actorUserId?: string | null;
  comments?: string | null;
  createdAt: string;
};

export type TravelAllowancePolicyRecord = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  employeeLevelId?: string | null;
  employeeLevel?: {
    code: string;
    name: string;
  } | null;
  countryCode?: string | null;
  city?: string | null;
  currencyCode: string;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo?: string | null;
  rules: TravelAllowanceRuleRecord[];
};

export type TravelAllowanceRuleRecord = {
  id: string;
  allowanceType: string;
  calculationBasis: string;
  amount: string;
  currencyCode: string;
  isActive: boolean;
};
