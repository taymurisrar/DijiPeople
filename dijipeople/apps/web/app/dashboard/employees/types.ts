export type EmployeeEmploymentStatus =
  | "ACTIVE"
  | "PROBATION"
  | "NOTICE"
  | "TERMINATED";

export type EmployeeType =
  | "FULL_TIME"
  | "PART_TIME"
  | "CONTRACT"
  | "INTERN"
  | "CONSULTANT";

export type EmployeeWorkMode = "OFFICE" | "REMOTE" | "HYBRID";

export type EmployeeContractType =
  | "PERMANENT"
  | "FIXED_TERM"
  | "FREELANCE"
  | "TEMPORARY";

export type PayrollStatus = "ACTIVE" | "ON_HOLD" | "STOPPED";

export type PaymentMode = "BANK_TRANSFER" | "CASH" | "CHECK" | "OTHER";

export type EmployeeGender =
  | "FEMALE"
  | "MALE"
  | "NON_BINARY"
  | "PREFER_NOT_TO_SAY";

export type EmployeeMaritalStatus =
  | "SINGLE"
  | "MARRIED"
  | "DIVORCED"
  | "WIDOWED"
  | "SEPARATED";

export type LookupOption = {
  id: string;
  name: string;
  key?: string | null;
  code?: string | null;
  countryId?: string | null;
  stateProvinceId?: string | null;
};

export type LookupFieldProps = {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: LookupOption[];
  placeholder: string;
  value: string;
  required?: boolean;
  noResultsText?: string;
};

export type EmployeeRoleOption = {
  id: string;
  key: string;
  name: string;
};

export type EmployeeSummaryReference = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  preferredName?: string | null;
  fullName: string;
  employmentStatus: EmployeeEmploymentStatus;
};

export type EmployeeDocumentSummary = {
  id: string;
  fileName: string;
  title?: string | null;
  description?: string | null;
  documentTypeId?: string | null;
  documentType: {
    id: string;
    key?: string | null;
    name: string;
  } | null;
  documentCategoryId?: string | null;
  documentCategory: {
    id: string;
    code?: string | null;
    name: string;
  } | null;
  mimeType: string;
  size: number;
  storageKey?: string | null;
  createdAt: string;
  uploadedByUser: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
  } | null;
  viewPath: string;
  downloadPath: string;
};

export type EmployeeListItem = {
  id: string;
  tenantId: string;
  employeeCode: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  preferredName?: string | null;
  fullName: string;
  profileImageDocumentId?: string | null;
  workEmail?: string | null;
  personalEmail?: string | null;
  phone: string;
  alternatePhone?: string | null;
  dateOfBirth?: string | null;
  gender?: EmployeeGender | null;
  maritalStatus?: EmployeeMaritalStatus | null;
  nationalityCountryId?: string | null;
  nationality?: string | null;
  cnic?: string | null;
  bloodGroup?: string | null;
  employmentStatus: EmployeeEmploymentStatus;
  employeeType?: EmployeeType | null;
  workMode?: EmployeeWorkMode | null;
  contractType?: EmployeeContractType | null;
  hireDate: string;
  confirmationDate?: string | null;
  probationEndDate?: string | null;
  terminationDate?: string | null;
  departmentId?: string | null;
  designationId?: string | null;
  locationId?: string | null;
  managerEmployeeId?: string | null;
  reportingManagerEmployeeId?: string | null;
  officialJoiningLocationId?: string | null;
  userId?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  stateProvince?: string | null;
  country?: string | null;
  countryId?: string | null;
  stateProvinceId?: string | null;
  cityId?: string | null;
  postalCode?: string | null;
  emergencyContactName?: string | null;
  emergencyContactRelation?: string | null;
  emergencyContactRelationTypeId?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactAlternatePhone?: string | null;
  noticePeriodDays?: number | null;
  taxIdentifier?: string | null;
  isDraftProfile?: boolean;
  sourceCandidateId?: string | null;
  sourceApplicationId?: string | null;
  sourceJobOpeningId?: string | null;
  createdAt: string;
  updatedAt: string;
  manager: EmployeeSummaryReference | null;
  reportingManager: EmployeeSummaryReference | null;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    status: string;
    roles: EmployeeRoleOption[];
  } | null;
  department: {
    id: string;
    name: string;
    code?: string | null;
    isActive: boolean;
  } | null;
  designation: {
    id: string;
    name: string;
    level?: string | null;
    isActive: boolean;
  } | null;
  location: {
    id: string;
    name: string;
    city: string;
    state: string;
    country: string;
    timezone?: string | null;
    isActive: boolean;
  } | null;
  officialJoiningLocation: {
    id: string;
    name: string;
    city: string;
    state: string;
    country: string;
    timezone?: string | null;
    isActive: boolean;
  } | null;
  profileImage: EmployeeDocumentSummary | null;
  counts: {
    directReports: number;
    educationRecords: number;
    historyRecords: number;
    documents: number;
  };
};

export type EmployeeHierarchyPreview = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  preferredName?: string | null;
  fullName: string;
  employmentStatus: EmployeeEmploymentStatus;
  workEmail?: string | null;
  phone?: string | null;
  managerEmployeeId?: string | null;
  reportingManagerEmployeeId?: string | null;
  designation: {
    id: string;
    name: string;
    level?: string | null;
  } | null;
  department: {
    id: string;
    name: string;
    code?: string | null;
  } | null;
};

export type EmployeeHierarchyNode = {
  id: string;
  tenantId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  preferredName?: string | null;
  fullName: string;
  employmentStatus: EmployeeEmploymentStatus;
  managerEmployeeId?: string | null;
  reportingManagerEmployeeId?: string | null;
};

export type EmployeeHierarchyResponse = {
  employee: EmployeeListItem;
  managerChain: EmployeeHierarchyNode[];
  directReports: EmployeeHierarchyPreview[];
};

export type EmployeeListResponse = {
  items: EmployeeListItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filters: {
    search: string | null;
    employmentStatus: EmployeeEmploymentStatus | null;
    reportingManagerEmployeeId: string | null;
  };
};

export type EmployeeFormValues = {
  employeeCode: string;
  firstName: string;
  middleName: string;
  lastName: string;
  preferredName: string;
  workEmail: string;
  personalEmail: string;
  phone: string;
  alternatePhone: string;
  dateOfBirth: string;
  gender: string;
  maritalStatus: string;
  nationalityCountryId: string;
  nationality: string;
  cnic: string;
  bloodGroup: string;
  employmentStatus: EmployeeEmploymentStatus;
  employeeType: string;
  workMode: string;
  contractType: string;
  hireDate: string;
  confirmationDate: string;
  probationEndDate: string;
  terminationDate: string;
  departmentId: string;
  designationId: string;
  locationId: string;
  officialJoiningLocationId: string;
  reportingManagerEmployeeId: string;
  userId: string;
  noticePeriodDays: number | null;
  taxIdentifier: string;
  provisionSystemAccess: boolean;
  sendInvitationNow: boolean;
  initialRoleIds: string[];
  addressLine1: string;
  addressLine2: string;
  countryId: string;
  stateProvinceId: string;
  cityId: string;
  postalCode: string;
  emergencyContactName: string;
  emergencyContactRelation: string;
  emergencyContactRelationTypeId: string;
  emergencyContactPhone: string;
  emergencyContactAlternatePhone: string;
};

export type EmployeeProfile = EmployeeListItem & {
  basicProfile: {
    fullName: string;
    employeeCode: string;
    designation: string | null;
    department: string | null;
    managerName: string | null;
    reportingManagerName?: string | null;
    employmentStatus: EmployeeEmploymentStatus;
    hireDate: string;
    workEmail: string | null;
    phone: string;
  };
  personalInfo: {
    firstName: string;
    middleName?: string | null;
    lastName: string;
    preferredName?: string | null;
    workEmail?: string | null;
    personalEmail?: string | null;
    phone: string;
    alternatePhone?: string | null;
    dateOfBirth?: string | null;
    gender?: EmployeeGender | null;
    maritalStatus?: EmployeeMaritalStatus | null;
    nationalityCountryId?: string | null;
    nationality?: string | null;
    cnic?: string | null;
    bloodGroup?: string | null;
  };
  employmentInfo: {
    employmentStatus: EmployeeEmploymentStatus;
    employeeType?: EmployeeType | null;
    workMode?: EmployeeWorkMode | null;
    contractType?: EmployeeContractType | null;
    hireDate: string;
    confirmationDate?: string | null;
    probationEndDate?: string | null;
    terminationDate?: string | null;
    department: EmployeeListItem["department"];
    designation: EmployeeListItem["designation"];
    location: EmployeeListItem["location"];
    officialJoiningLocation: EmployeeListItem["officialJoiningLocation"];
    noticePeriodDays?: number | null;
    taxIdentifier?: string | null;
    manager: {
      id: string;
      fullName: string;
    } | null;
    reportingManager: {
      id: string;
      fullName: string;
    } | null;
  };
  addressInfo: {
    addressLine1?: string | null;
    addressLine2?: string | null;
    countryId?: string | null;
    stateProvinceId?: string | null;
    cityId?: string | null;
    city?: string | null;
    stateProvince?: string | null;
    country?: string | null;
    postalCode?: string | null;
  };
  emergencyContact: {
    emergencyContactName?: string | null;
    emergencyContactRelationTypeId?: string | null;
    emergencyContactRelation?: string | null;
    emergencyContactPhone?: string | null;
    emergencyContactAlternatePhone?: string | null;
  };
  educationRecords: EmployeeEducationRecord[];
  previousEmployments: EmployeePreviousEmploymentRecord[];
  currentCompensation: EmployeeCompensationRecord | null;
  employeeHistory: EmployeeHistoryRecord[];
  leaveHistory: EmployeeLeaveHistoryRecord[];
  documents: EmployeeDocumentSummary[];
  derivedStats: {
    yearsSinceJoining: number;
    daysSinceJoining: number;
    age: number | null;
    birthdayToday: boolean;
    daysUntilBirthday: number | null;
  };
};

export type EmployeeEducationRecord = {
  id: string;
  tenantId: string;
  employeeId: string;
  institutionName: string;
  degreeTitle: string;
  fieldOfStudy?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  gradeOrCgpa?: string | null;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeHistoryRecord = {
  id: string;
  tenantId: string;
  employeeId: string;
  eventType: string;
  eventDate: string;
  title: string;
  description?: string | null;
  changedByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
  changedByUser: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
};

export type EmployeeCompensationRecord = {
  id: string;
  tenantId: string;
  employeeId: string;
  basicSalary: string;
  payFrequency: string;
  effectiveDate: string;
  endDate?: string | null;
  currency: string;
  payrollStatus: PayrollStatus;
  payrollGroup?: string | null;
  paymentMode?: PaymentMode | null;
  bankName?: string | null;
  bankAccountTitle?: string | null;
  bankAccountNumber?: string | null;
  bankIban?: string | null;
  bankRoutingNumber?: string | null;
  taxIdentifier?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmployeePreviousEmploymentRecord = {
  id: string;
  tenantId: string;
  employeeId: string;
  companyName: string;
  jobTitle: string;
  department?: string | null;
  employmentType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  finalSalary?: string | null;
  reasonForLeaving?: string | null;
  referenceName?: string | null;
  referenceContact?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeLeaveHistoryRecord = {
  id: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  status: string;
  reason?: string | null;
  leaveType: {
    id: string;
    name: string;
    code: string;
  };
  approver: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  createdAt: string;
};
