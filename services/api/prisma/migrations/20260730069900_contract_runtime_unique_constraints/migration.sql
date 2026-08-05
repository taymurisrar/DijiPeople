-- The enterprise contract foundation was applied to an existing environment
-- with its foreign keys and indexes restored separately. Keep these schema
-- constraints explicit so fresh installations and upgrades are identical.
CREATE UNIQUE INDEX IF NOT EXISTS "ContractTemplate_key_contractType_key"
  ON "ContractTemplate"("key", "contractType");
CREATE UNIQUE INDEX IF NOT EXISTS "ContractTemplateVersion_templateId_version_key"
  ON "ContractTemplateVersion"("templateId", "version");
CREATE UNIQUE INDEX IF NOT EXISTS "ContractVersion_contractId_version_key"
  ON "ContractVersion"("contractId", "version");
CREATE UNIQUE INDEX IF NOT EXISTS "ContractPlaceholderValue_contractId_key_key"
  ON "ContractPlaceholderValue"("contractId", "key");
