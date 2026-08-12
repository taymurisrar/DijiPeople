ALTER TABLE "Contract"
ADD COLUMN "allowChangeRequests" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "ContractParty"
ADD COLUMN "isSignatory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "signatureRequired" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SignatureRequest"
ADD COLUMN "allowChangeRequests" BOOLEAN NOT NULL DEFAULT true;
