-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OnboardingStatus" ADD VALUE 'NOT_STARTED';
ALTER TYPE "OnboardingStatus" ADD VALUE 'AWAITING_CANDIDATE_INPUT';
ALTER TYPE "OnboardingStatus" ADD VALUE 'READY_FOR_CONVERSION';
ALTER TYPE "OnboardingStatus" ADD VALUE 'BLOCKED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RecruitmentStage" ADD VALUE 'SHORTLISTED';
ALTER TYPE "RecruitmentStage" ADD VALUE 'FINAL_REVIEW';
ALTER TYPE "RecruitmentStage" ADD VALUE 'APPROVED';
ALTER TYPE "RecruitmentStage" ADD VALUE 'ON_HOLD';

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "latestEvaluationSummary" TEXT,
ADD COLUMN     "matchBreakdown" JSONB,
ADD COLUMN     "matchScore" INTEGER,
ADD COLUMN     "recruiterOwnerUserId" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT;

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "addressArea" TEXT,
ADD COLUMN     "alternatePhone" TEXT,
ADD COLUMN     "certifications" JSONB,
ADD COLUMN     "concerns" TEXT,
ADD COLUMN     "currentCity" TEXT,
ADD COLUMN     "currentCityId" TEXT,
ADD COLUMN     "currentCountry" TEXT,
ADD COLUMN     "currentCountryId" TEXT,
ADD COLUMN     "currentDesignation" TEXT,
ADD COLUMN     "currentEmployer" TEXT,
ADD COLUMN     "currentSalary" DECIMAL(12,2),
ADD COLUMN     "currentStateProvince" TEXT,
ADD COLUMN     "currentStateProvinceId" TEXT,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "earliestJoiningDate" TIMESTAMP(3),
ADD COLUMN     "expectedSalary" DECIMAL(12,2),
ADD COLUMN     "gender" "EmployeeGender",
ADD COLUMN     "hobbies" JSONB,
ADD COLUMN     "hrNotes" TEXT,
ADD COLUMN     "interests" JSONB,
ADD COLUMN     "linkedInUrl" TEXT,
ADD COLUMN     "middleName" TEXT,
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "nationalityCountryId" TEXT,
ADD COLUMN     "noticePeriodDays" INTEGER,
ADD COLUMN     "otherProfileUrl" TEXT,
ADD COLUMN     "personalEmail" TEXT,
ADD COLUMN     "portfolioUrl" TEXT,
ADD COLUMN     "preferredLocation" TEXT,
ADD COLUMN     "preferredWorkMode" "EmployeeWorkMode",
ADD COLUMN     "profileSummary" TEXT,
ADD COLUMN     "reasonForLeavingCurrentEmployer" TEXT,
ADD COLUMN     "recruiterNotes" TEXT,
ADD COLUMN     "relevantYearsExperience" DECIMAL(5,2),
ADD COLUMN     "skills" JSONB,
ADD COLUMN     "strengths" JSONB,
ADD COLUMN     "totalYearsExperience" DECIMAL(5,2),
ADD COLUMN     "willingToRelocate" BOOLEAN DEFAULT false;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "nationalityCountryId" TEXT;

-- AlterTable
ALTER TABLE "EmployeeOnboarding" ADD COLUMN     "ownerUserId" TEXT,
ADD COLUMN     "plannedJoiningDate" TIMESTAMP(3),
ADD COLUMN     "readyForConversionAt" TIMESTAMP(3),
ADD COLUMN     "targetDepartmentId" TEXT,
ADD COLUMN     "targetDesignationId" TEXT,
ADD COLUMN     "targetLocationId" TEXT,
ADD COLUMN     "targetReportingManagerEmployeeId" TEXT,
ADD COLUMN     "targetWorkEmail" TEXT;

-- AlterTable
ALTER TABLE "OnboardingTask" ADD COLUMN     "checklistGroup" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "isRequired" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notes" TEXT;

-- CreateTable
CREATE TABLE "CandidateEducation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "institutionName" TEXT NOT NULL,
    "degreeTitle" TEXT NOT NULL,
    "fieldOfStudy" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "gradeOrCgpa" TEXT,
    "country" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "CandidateEducation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateExperience" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "location" TEXT,
    "employmentType" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "responsibilities" TEXT,
    "finalSalary" DECIMAL(12,2),
    "reasonForLeaving" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "CandidateExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateEvaluation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "applicationId" TEXT,
    "interviewRound" INTEGER NOT NULL DEFAULT 1,
    "interviewDate" TIMESTAMP(3),
    "interviewerUserId" TEXT,
    "currentSalary" DECIMAL(12,2),
    "expectedSalary" DECIMAL(12,2),
    "joiningAvailabilityDays" INTEGER,
    "cityOfResidence" TEXT,
    "countryOfResidence" TEXT,
    "interests" TEXT,
    "hobbies" TEXT,
    "reasonForLeaving" TEXT,
    "technicalScore" INTEGER,
    "communicationScore" INTEGER,
    "cultureFitScore" INTEGER,
    "interviewOutcome" TEXT,
    "overallRecommendation" TEXT,
    "concerns" TEXT,
    "followUpNotes" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "CandidateEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationStageHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fromStage" "RecruitmentStage",
    "toStage" "RecruitmentStage" NOT NULL,
    "note" TEXT,
    "changedByUserId" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "ApplicationStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CandidateEducation_tenantId_idx" ON "CandidateEducation"("tenantId");

-- CreateIndex
CREATE INDEX "CandidateEducation_tenantId_candidateId_idx" ON "CandidateEducation"("tenantId", "candidateId");

-- CreateIndex
CREATE INDEX "CandidateExperience_tenantId_idx" ON "CandidateExperience"("tenantId");

-- CreateIndex
CREATE INDEX "CandidateExperience_tenantId_candidateId_idx" ON "CandidateExperience"("tenantId", "candidateId");

-- CreateIndex
CREATE INDEX "CandidateEvaluation_tenantId_idx" ON "CandidateEvaluation"("tenantId");

-- CreateIndex
CREATE INDEX "CandidateEvaluation_tenantId_candidateId_idx" ON "CandidateEvaluation"("tenantId", "candidateId");

-- CreateIndex
CREATE INDEX "CandidateEvaluation_tenantId_applicationId_idx" ON "CandidateEvaluation"("tenantId", "applicationId");

-- CreateIndex
CREATE INDEX "ApplicationStageHistory_tenantId_idx" ON "ApplicationStageHistory"("tenantId");

-- CreateIndex
CREATE INDEX "ApplicationStageHistory_tenantId_applicationId_changedAt_idx" ON "ApplicationStageHistory"("tenantId", "applicationId", "changedAt");

-- CreateIndex
CREATE INDEX "Application_tenantId_recruiterOwnerUserId_idx" ON "Application"("tenantId", "recruiterOwnerUserId");

-- CreateIndex
CREATE INDEX "Candidate_tenantId_source_idx" ON "Candidate"("tenantId", "source");

-- CreateIndex
CREATE INDEX "Candidate_tenantId_currentCountry_idx" ON "Candidate"("tenantId", "currentCountry");

-- CreateIndex
CREATE INDEX "Candidate_tenantId_currentCity_idx" ON "Candidate"("tenantId", "currentCity");

-- CreateIndex
CREATE INDEX "Employee_tenantId_nationalityCountryId_idx" ON "Employee"("tenantId", "nationalityCountryId");

-- AddForeignKey
ALTER TABLE "CandidateEducation" ADD CONSTRAINT "CandidateEducation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateEducation" ADD CONSTRAINT "CandidateEducation_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateExperience" ADD CONSTRAINT "CandidateExperience_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateExperience" ADD CONSTRAINT "CandidateExperience_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateEvaluation" ADD CONSTRAINT "CandidateEvaluation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateEvaluation" ADD CONSTRAINT "CandidateEvaluation_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateEvaluation" ADD CONSTRAINT "CandidateEvaluation_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationStageHistory" ADD CONSTRAINT "ApplicationStageHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationStageHistory" ADD CONSTRAINT "ApplicationStageHistory_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

