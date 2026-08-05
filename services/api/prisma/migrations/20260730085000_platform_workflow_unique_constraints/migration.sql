-- Restore schema-declared business-key constraints in databases whose
-- foundation migration was applied before these indexes were finalized.
CREATE UNIQUE INDEX IF NOT EXISTS "Partner_code_key"
ON "Partner"("code");

CREATE UNIQUE INDEX IF NOT EXISTS "PartnerInquiry_referenceNumber_key"
ON "PartnerInquiry"("referenceNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "PartnerCommission_commissionNumber_key"
ON "PartnerCommission"("commissionNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "SignatureRequest_requestNumber_key"
ON "SignatureRequest"("requestNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "SignatureRecipient_accessTokenHash_key"
ON "SignatureRecipient"("accessTokenHash");

CREATE UNIQUE INDEX IF NOT EXISTS "SignatureEvidence_recipientId_key"
ON "SignatureEvidence"("recipientId");

CREATE UNIQUE INDEX IF NOT EXISTS "PartnerPortalUser_email_key"
ON "PartnerPortalUser"("email");

CREATE UNIQUE INDEX IF NOT EXISTS "PartnerLeadReview_leadId_key"
ON "PartnerLeadReview"("leadId");

CREATE UNIQUE INDEX IF NOT EXISTS "SupportCase_caseNumber_key"
ON "SupportCase"("caseNumber");
