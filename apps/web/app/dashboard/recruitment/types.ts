export type JobOpeningStatus =
  | "DRAFT"
  | "OPEN"
  | "ON_HOLD"
  | "CLOSED"
  | "FILLED"
  | "CANCELLED";

export type RecruitmentStage =
  | "APPLIED"
  | "SCREENING"
  | "SHORTLISTED"
  | "INTERVIEW"
  | "FINAL_REVIEW"
  | "OFFER"
  | "APPROVED"
  | "HIRED"
  | "REJECTED"
  | "ON_HOLD"
  | "WITHDRAWN";

export type CandidateDocumentRecord = {
  id: string;
  name: string;
  kind: string;
  fileName: string;
  contentType?: string | null;
  fileSizeBytes?: number | null;
  storageKey?: string | null;
  uploadedAt?: string | null;
  isResume?: boolean;
  isPrimaryResume?: boolean;
  isLatestResume?: boolean;
  sourceChannel?: string | null;
  parserVersion?: string | null;
  parsingStatus?: "PENDING" | "QUEUED" | "PROCESSING" | "SUCCEEDED" | "FAILED" | null;
  parsedAt?: string | null;
  extractionConfidence?: number | null;
  parsingWarnings?: string[] | null;
  viewPath?: string;
  downloadPath?: string;
  createdAt?: string;
};

export type CandidateParsingJobRecord = {
  id: string;
  documentReferenceId: string;
  parserKey?: string | null;
  status: "PENDING" | "QUEUED" | "PROCESSING" | "SUCCEEDED" | "FAILED";
  requestedAt: string;
  queuedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  resultMetadata?: unknown;
  errorMessage?: string | null;
  documentReference: {
    id: string;
    name: string;
    kind: string;
    fileName: string;
  };
};

export type CandidateEducationRecord = {
  id?: string;
  institutionName: string;
  degreeTitle: string;
  fieldOfStudy?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  gradeOrCgpa?: string | null;
  country?: string | null;
  notes?: string | null;
};

export type CandidateExperienceRecord = {
  id?: string;
  companyName: string;
  designation: string;
  location?: string | null;
  employmentType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  responsibilities?: string | null;
  finalSalary?: number | null;
  reasonForLeaving?: string | null;
};

export type CandidateEvaluationRecord = {
  id: string;
  applicationId?: string | null;
  interviewRound?: number | null;
  interviewDate?: string | null;
  interviewerUserId?: string | null;
  currentSalary?: number | null;
  expectedSalary?: number | null;
  joiningAvailabilityDays?: number | null;
  cityOfResidence?: string | null;
  countryOfResidence?: string | null;
  interests?: string | null;
  hobbies?: string | null;
  reasonForLeaving?: string | null;
  technicalScore?: number | null;
  communicationScore?: number | null;
  cultureFitScore?: number | null;
  interviewOutcome?: string | null;
  overallRecommendation?: string | null;
  concerns?: string | null;
  followUpNotes?: string | null;
  notes?: string | null;
  createdAt: string;
};

export type JobOpeningMatchCriteria = {
  requiredSkills: string[];
  preferredSkills: string[];
  minimumYearsExperience?: number | null;
  educationLevels?: string[];
  allowedWorkModes?: string[];
  allowedLocations?: string[];
  noticePeriodDays?: number | null;
  weights: {
    skillMatch: number;
    experienceFit: number;
    educationFit: number;
    locationFit: number;
    availabilityFit: number;
  };
  knockoutRules?: {
    requireAllMandatorySkills?: boolean;
    rejectIfExperienceBelowMinimum?: boolean;
    rejectIfWorkModeMismatch?: boolean;
    rejectIfLocationMismatch?: boolean;
  };
};

export type ApplicationMatchBreakdown = {
  skillMatch?: {
    score: number;
    matchedSkills: string[];
    missingRequiredSkills?: string[];
    matchedPreferredSkills?: string[];
  };
  experienceFit?: {
    score: number;
    candidateYearsExperience?: number | null;
    minimumYearsExperience?: number | null;
  };
  educationFit?: {
    score: number;
    matchedEducationLevels?: string[];
  };
  locationFit?: {
    score: number;
    candidateLocation?: string | null;
    matchedLocation?: string | null;
  };
  availabilityFit?: {
    score: number;
    candidateNoticePeriodDays?: number | null;
    allowedNoticePeriodDays?: number | null;
  };
  knockoutSummary?: {
    failedRules: string[];
    passed: boolean;
  };
};

export function hasMatchCriteriaConfigured(
  criteria?: JobOpeningMatchCriteria | null,
): boolean {
  if (!criteria) {
    return false;
  }

  return Boolean(
    criteria.requiredSkills.length ||
      criteria.preferredSkills.length ||
      criteria.minimumYearsExperience != null ||
      criteria.educationLevels?.length ||
      criteria.allowedWorkModes?.length ||
      criteria.allowedLocations?.length ||
      criteria.noticePeriodDays != null,
  );
}

export type ApplicationStageHistoryRecord = {
  id: string;
  fromStage?: RecruitmentStage | null;
  toStage: RecruitmentStage;
  note?: string | null;
  changedByUserId?: string | null;
  changedAt: string;
};

export type CandidateHistoryRecord = {
  id: string;
  snapshotVersion: number;
  snapshotReason:
    | "REUPLOAD"
    | "MERGE"
    | "PROFILE_UPDATE"
    | "PARSE_UPDATE"
    | "MANUAL_UPDATE";
  snapshotTakenAt: string;
  originalCreatedAt: string;
  sourceDocumentId?: string | null;
  sourceChannel?: string | null;
};

export type ApplicationHistoryRecord = {
  id: string;
  snapshotVersion: number;
  snapshotReason:
    | "REAPPLY"
    | "STAGE_CHANGE"
    | "MATCH_RECALCULATION"
    | "MANUAL_EDIT"
    | "DUPLICATE_RESOLUTION";
  snapshotTakenAt: string;
  originalAppliedAt: string;
};

export type ApplicationRecord = {
  id: string;
  tenantId: string;
  candidateId: string;
  jobOpeningId: string;
  stage: RecruitmentStage;
  notes?: string | null;
  rejectionReason?: string | null;
  matchScore?: number | null;
  matchBreakdown?: ApplicationMatchBreakdown | null;
  latestEvaluationSummary?: string | null;
  appliedAt: string;
  movedAt?: string | null;
  rejectedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  candidate: {
    id: string;
    firstName: string;
    middleName?: string | null;
    lastName: string;
    fullName: string;
    email: string;
    phone: string;
    source?: string | null;
    currentStatus: RecruitmentStage;
    currentCity?: string | null;
    currentCountry?: string | null;
    totalYearsExperience?: number | null;
    preferredWorkMode?: string | null;
    resumeDocumentReference?: string | null;
  };
  jobOpening: {
    id: string;
    title: string;
    code?: string | null;
    status: JobOpeningStatus;
    description?: string | null;
    matchCriteria?: JobOpeningMatchCriteria | null;
  };
  draftEmployee?: {
    id: string;
    employeeCode: string;
    firstName: string;
    middleName?: string | null;
    lastName: string;
    fullName: string;
    isDraftProfile: boolean;
    sourceCandidateId?: string | null;
    sourceApplicationId?: string | null;
    sourceJobOpeningId?: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  stageHistory: ApplicationStageHistoryRecord[];
  historyRecords?: ApplicationHistoryRecord[];
  evaluations: CandidateEvaluationRecord[];
};

export type JobOpeningRecord = {
  id: string;
  tenantId: string;
  title: string;
  code?: string | null;
  description?: string | null;
  status: JobOpeningStatus;
  matchCriteria?: JobOpeningMatchCriteria | null;
  createdAt: string;
  updatedAt: string;
  applications: ApplicationRecord[];
};

export type CandidateRecord = {
  id: string;
  tenantId: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  fullName: string;
  email: string;
  personalEmail?: string | null;
  phone: string;
  alternatePhone?: string | null;
  source?: string | null;
  currentStatus: RecruitmentStage;
  gender?: string | null;
  dateOfBirth?: string | null;
  nationalityCountryId?: string | null;
  nationality?: string | null;
  currentCountryId?: string | null;
  currentStateProvinceId?: string | null;
  currentCityId?: string | null;
  currentCountry?: string | null;
  currentStateProvince?: string | null;
  currentCity?: string | null;
  addressArea?: string | null;
  profileSummary?: string | null;
  currentEmployer?: string | null;
  currentDesignation?: string | null;
  totalYearsExperience?: number | null;
  relevantYearsExperience?: number | null;
  currentSalary?: number | null;
  expectedSalary?: number | null;
  noticePeriodDays?: number | null;
  earliestJoiningDate?: string | null;
  reasonForLeavingCurrentEmployer?: string | null;
  preferredWorkMode?: string | null;
  preferredLocation?: string | null;
  willingToRelocate?: boolean | null;
  skills: string[];
  certifications: string[];
  interests: string[];
  hobbies: string[];
  strengths: string[];
  concerns?: string | null;
  recruiterNotes?: string | null;
  hrNotes?: string | null;
  portfolioUrl?: string | null;
  linkedInUrl?: string | null;
  otherProfileUrl?: string | null;
  resumeDocumentReference?: string | null;
  resumeDocument: CandidateDocumentRecord | null;
  latestResumeDocument?: CandidateDocumentRecord | null;
  identities?: Array<{
    id: string;
    type: "EMAIL" | "PHONE" | "LINKEDIN" | "NATIONAL_ID";
    value: string;
    normalizedValue: string;
    isPrimary: boolean;
    source?: string | null;
    confidence: number;
  }>;
  documents: CandidateDocumentRecord[];
  parsingJobs: CandidateParsingJobRecord[];
  educationRecords: CandidateEducationRecord[];
  experienceRecords: CandidateExperienceRecord[];
  evaluations: CandidateEvaluationRecord[];
  historyRecords?: CandidateHistoryRecord[];
  createdAt: string;
  updatedAt: string;
  applications: ApplicationRecord[];
};

export type JobOpeningListResponse = {
  items: JobOpeningRecord[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filters: {
    search?: string | null;
    status?: JobOpeningStatus | null;
  };
};

export type CandidateListResponse = {
  items: CandidateRecord[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filters: {
    search?: string | null;
    currentStatus?: RecruitmentStage | null;
    source?: string | null;
    skill?: string | null;
    city?: string | null;
  };
};

export type ApplicationListResponse = {
  items: ApplicationRecord[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filters: {
    search?: string | null;
    stage?: RecruitmentStage | null;
    candidateId?: string | null;
    jobOpeningId?: string | null;
    rejectionReason?: string | null;
  };
};
