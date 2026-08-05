ALTER TABLE "Contract" ADD COLUMN "customerOnboardingId" TEXT;

CREATE INDEX "Contract_customerOnboardingId_status_idx" ON "Contract"("customerOnboardingId", "status");

ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_customerOnboardingId_fkey"
  FOREIGN KEY ("customerOnboardingId") REFERENCES "CustomerOnboarding"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
