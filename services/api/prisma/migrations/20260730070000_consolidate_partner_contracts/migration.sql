-- Consolidate the preliminary partner-only agreement tables into the shared,
-- versioned contract runtime before removing the duplicate persistence path.
INSERT INTO "ContractTemplate" (
  "id", "key", "name", "contractType", "description", "isActive", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  legacy."key",
  MAX(legacy."name"),
  'PARTNER_AGREEMENT'::"ContractType",
  'Migrated partner agreement template',
  BOOL_OR(legacy."isActive"),
  MIN(legacy."createdAt"),
  MAX(legacy."updatedAt")
FROM "PartnerContractTemplate" legacy
GROUP BY legacy."key"
ON CONFLICT ("key", "contractType") DO NOTHING;

INSERT INTO "ContractTemplateVersion" (
  "id", "templateId", "version", "title", "contentHtml", "contentText",
  "placeholders", "changeSummary", "isPublished", "publishedAt", "createdAt"
)
SELECT
  gen_random_uuid()::text,
  normalized."id",
  legacy."version",
  legacy."title",
  '<p>' || replace(replace(replace(legacy."bodyText", '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</p>',
  legacy."bodyText",
  jsonb_build_object(
    'partnerCommissionRate', legacy."defaultCommissionRate",
    'currencyCode', legacy."defaultCurrencyCode"
  ),
  'Migrated from the preliminary partner agreement workflow',
  legacy."isActive",
  CASE WHEN legacy."isActive" THEN legacy."createdAt" ELSE NULL END,
  legacy."createdAt"
FROM "PartnerContractTemplate" legacy
JOIN "ContractTemplate" normalized
  ON normalized."key" = legacy."key"
 AND normalized."contractType" = 'PARTNER_AGREEMENT'::"ContractType"
ON CONFLICT ("templateId", "version") DO NOTHING;

INSERT INTO "Contract" (
  "id", "contractNumber", "title", "contractType", "status", "templateId",
  "partnerId", "counterpartyName", "counterpartyEmail", "currencyCode",
  "effectiveDate", "expiryDate", "currentVersionNumber", "activatedAt",
  "terminatedAt", "createdAt", "updatedAt"
)
SELECT
  legacy."id",
  legacy."contractNumber",
  legacy."title",
  'PARTNER_AGREEMENT'::"ContractType",
  CASE legacy."status"::text
    WHEN 'SENT' THEN 'SIGNATURE_IN_PROGRESS'::"ContractStatus"
    WHEN 'VIEWED' THEN 'SIGNATURE_IN_PROGRESS'::"ContractStatus"
    WHEN 'SIGNED' THEN 'FULLY_SIGNED'::"ContractStatus"
    WHEN 'EXPIRED' THEN 'EXPIRED'::"ContractStatus"
    WHEN 'TERMINATED' THEN 'TERMINATED'::"ContractStatus"
    ELSE 'DRAFT'::"ContractStatus"
  END,
  normalized_template."id",
  legacy."partnerId",
  partner."displayName",
  COALESCE(legacy."signerEmail", partner."email"),
  legacy."currencyCode",
  legacy."effectiveFrom",
  legacy."effectiveTo",
  1,
  legacy."signedAt",
  CASE WHEN legacy."status"::text = 'TERMINATED' THEN legacy."updatedAt" ELSE NULL END,
  legacy."createdAt",
  legacy."updatedAt"
FROM "PartnerContract" legacy
JOIN "Partner" partner ON partner."id" = legacy."partnerId"
LEFT JOIN "PartnerContractTemplate" legacy_template ON legacy_template."id" = legacy."templateId"
LEFT JOIN "ContractTemplate" normalized_template
  ON normalized_template."key" = legacy_template."key"
 AND normalized_template."contractType" = 'PARTNER_AGREEMENT'::"ContractType"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ContractVersion" (
  "id", "contractId", "templateVersionId", "version", "status", "title",
  "contentHtml", "contentText", "contentSha256", "changeSummary", "lockedAt",
  "signedAt", "createdAt"
)
SELECT
  gen_random_uuid()::text,
  legacy."id",
  normalized_version."id",
  1,
  CASE
    WHEN legacy."status"::text = 'SIGNED' THEN 'SIGNED'::"ContractVersionStatus"
    ELSE 'DRAFT'::"ContractVersionStatus"
  END,
  legacy."title",
  '<p>' || replace(replace(replace(
    COALESCE(legacy."termsSnapshot"->>'bodyText', legacy."title"),
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</p>',
  COALESCE(legacy."termsSnapshot"->>'bodyText', legacy."title"),
  encode(digest(COALESCE(legacy."termsSnapshot"->>'bodyText', legacy."title"), 'sha256'), 'hex'),
  'Migrated from the preliminary partner agreement workflow',
  legacy."signedAt",
  legacy."signedAt",
  legacy."createdAt"
FROM "PartnerContract" legacy
LEFT JOIN "PartnerContractTemplate" legacy_template ON legacy_template."id" = legacy."templateId"
LEFT JOIN "ContractTemplate" normalized_template
  ON normalized_template."key" = legacy_template."key"
 AND normalized_template."contractType" = 'PARTNER_AGREEMENT'::"ContractType"
LEFT JOIN "ContractTemplateVersion" normalized_version
  ON normalized_version."templateId" = normalized_template."id"
 AND normalized_version."version" = legacy_template."version"
ON CONFLICT ("contractId", "version") DO NOTHING;

INSERT INTO "ContractPlaceholderValue" (
  "id", "contractId", "key", "value", "source", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  legacy."id",
  'partnerCommissionRate',
  legacy."commissionRate"::text,
  'legacy-partner-contract',
  legacy."createdAt",
  legacy."updatedAt"
FROM "PartnerContract" legacy
ON CONFLICT ("contractId", "key") DO NOTHING;

INSERT INTO "ContractTimeline" (
  "id", "contractId", "eventType", "actorType", "message", "metadata", "createdAt"
)
SELECT
  gen_random_uuid()::text,
  legacy."id",
  'LEGACY_AGREEMENT_MIGRATED',
  'SYSTEM',
  'Partner agreement migrated to the shared contract runtime.',
  jsonb_build_object(
    'legacyStatus', legacy."status"::text,
    'legacyESignProvider', legacy."eSignProvider"::text,
    'externalEnvelopeId', legacy."externalEnvelopeId"
  ),
  legacy."updatedAt"
FROM "PartnerContract" legacy;

DROP TABLE "PartnerContract";
DROP TABLE "PartnerContractTemplate";
DROP TYPE "PartnerContractStatus";
DROP TYPE "PartnerESignProvider";
