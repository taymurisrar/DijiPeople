-- Prisma's native upsert requires a database-backed conflict target for the
-- externally visible agreement reference.
CREATE UNIQUE INDEX IF NOT EXISTS "Contract_contractNumber_key"
ON "Contract"("contractNumber");
