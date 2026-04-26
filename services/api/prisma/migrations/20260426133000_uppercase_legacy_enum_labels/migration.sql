DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'TenantStatus' AND e.enumlabel = 'Onboarding')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'TenantStatus' AND e.enumlabel = 'ONBOARDING') THEN
    ALTER TYPE "TenantStatus" RENAME VALUE 'Onboarding' TO 'ONBOARDING';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'TenantStatus' AND e.enumlabel = 'Active')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'TenantStatus' AND e.enumlabel = 'ACTIVE') THEN
    ALTER TYPE "TenantStatus" RENAME VALUE 'Active' TO 'ACTIVE';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'TenantStatus' AND e.enumlabel = 'Suspended')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'TenantStatus' AND e.enumlabel = 'SUSPENDED') THEN
    ALTER TYPE "TenantStatus" RENAME VALUE 'Suspended' TO 'SUSPENDED';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'TenantStatus' AND e.enumlabel = 'Churned')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'TenantStatus' AND e.enumlabel = 'CHURNED') THEN
    ALTER TYPE "TenantStatus" RENAME VALUE 'Churned' TO 'CHURNED';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'SubscriptionStatus' AND e.enumlabel = 'Trialing')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'SubscriptionStatus' AND e.enumlabel = 'TRIALING') THEN
    ALTER TYPE "SubscriptionStatus" RENAME VALUE 'Trialing' TO 'TRIALING';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'SubscriptionStatus' AND e.enumlabel = 'Active')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'SubscriptionStatus' AND e.enumlabel = 'ACTIVE') THEN
    ALTER TYPE "SubscriptionStatus" RENAME VALUE 'Active' TO 'ACTIVE';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'SubscriptionStatus' AND e.enumlabel = 'Past_Due')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'SubscriptionStatus' AND e.enumlabel = 'PAST_DUE') THEN
    ALTER TYPE "SubscriptionStatus" RENAME VALUE 'Past_Due' TO 'PAST_DUE';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'SubscriptionStatus' AND e.enumlabel = 'Cancelled')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'SubscriptionStatus' AND e.enumlabel = 'CANCELLED') THEN
    ALTER TYPE "SubscriptionStatus" RENAME VALUE 'Cancelled' TO 'CANCELLED';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'CustomerAccountStatus' AND e.enumlabel = 'Onboarding')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'CustomerAccountStatus' AND e.enumlabel = 'ONBOARDING') THEN
    ALTER TYPE "CustomerAccountStatus" RENAME VALUE 'Onboarding' TO 'ONBOARDING';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'CustomerAccountStatus' AND e.enumlabel = 'Active')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'CustomerAccountStatus' AND e.enumlabel = 'ACTIVE') THEN
    ALTER TYPE "CustomerAccountStatus" RENAME VALUE 'Active' TO 'ACTIVE';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'CustomerAccountStatus' AND e.enumlabel = 'Suspended')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'CustomerAccountStatus' AND e.enumlabel = 'SUSPENDED') THEN
    ALTER TYPE "CustomerAccountStatus" RENAME VALUE 'Suspended' TO 'SUSPENDED';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'CustomerAccountStatus' AND e.enumlabel = 'Churned')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'CustomerAccountStatus' AND e.enumlabel = 'CHURNED') THEN
    ALTER TYPE "CustomerAccountStatus" RENAME VALUE 'Churned' TO 'CHURNED';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'DocumentEntityType' AND e.enumlabel = 'Onboarding_RECORD')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'DocumentEntityType' AND e.enumlabel = 'ONBOARDING_RECORD') THEN
    ALTER TYPE "DocumentEntityType" RENAME VALUE 'Onboarding_RECORD' TO 'ONBOARDING_RECORD';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'UserStatus' AND e.enumlabel = 'Active')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'UserStatus' AND e.enumlabel = 'ACTIVE') THEN
    ALTER TYPE "UserStatus" RENAME VALUE 'Active' TO 'ACTIVE';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'EmployeeEmploymentStatus' AND e.enumlabel = 'Active')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'EmployeeEmploymentStatus' AND e.enumlabel = 'ACTIVE') THEN
    ALTER TYPE "EmployeeEmploymentStatus" RENAME VALUE 'Active' TO 'ACTIVE';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'LeaveRequestStatus' AND e.enumlabel = 'Cancelled')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'LeaveRequestStatus' AND e.enumlabel = 'CANCELLED') THEN
    ALTER TYPE "LeaveRequestStatus" RENAME VALUE 'Cancelled' TO 'CANCELLED';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'LeaveApprovalStepStatus' AND e.enumlabel = 'Cancelled')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'LeaveApprovalStepStatus' AND e.enumlabel = 'CANCELLED') THEN
    ALTER TYPE "LeaveApprovalStepStatus" RENAME VALUE 'Cancelled' TO 'CANCELLED';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'ProjectStatus' AND e.enumlabel = 'Active')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'ProjectStatus' AND e.enumlabel = 'ACTIVE') THEN
    ALTER TYPE "ProjectStatus" RENAME VALUE 'Active' TO 'ACTIVE';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'ProjectStatus' AND e.enumlabel = 'Cancelled')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'ProjectStatus' AND e.enumlabel = 'CANCELLED') THEN
    ALTER TYPE "ProjectStatus" RENAME VALUE 'Cancelled' TO 'CANCELLED';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'JobOpeningStatus' AND e.enumlabel = 'Cancelled')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'JobOpeningStatus' AND e.enumlabel = 'CANCELLED') THEN
    ALTER TYPE "JobOpeningStatus" RENAME VALUE 'Cancelled' TO 'CANCELLED';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'OnboardingStatus' AND e.enumlabel = 'Cancelled')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'OnboardingStatus' AND e.enumlabel = 'CANCELLED') THEN
    ALTER TYPE "OnboardingStatus" RENAME VALUE 'Cancelled' TO 'CANCELLED';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'OnboardingTaskStatus' AND e.enumlabel = 'Cancelled')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'OnboardingTaskStatus' AND e.enumlabel = 'CANCELLED') THEN
    ALTER TYPE "OnboardingTaskStatus" RENAME VALUE 'Cancelled' TO 'CANCELLED';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'PayrollStatus' AND e.enumlabel = 'Active')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'PayrollStatus' AND e.enumlabel = 'ACTIVE') THEN
    ALTER TYPE "PayrollStatus" RENAME VALUE 'Active' TO 'ACTIVE';
  END IF;
END $$;
