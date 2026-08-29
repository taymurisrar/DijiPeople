-- Platform-level FX rates (BUG-1745 follow-through).
--
-- Additive only: one new table, no column touched, no data moved. Reversible by
-- dropping it — nothing references it, and an empty table is a valid state in
-- which the dashboard reports unconvertible currencies rather than failing.
--
-- Not tenant-owned, and no `tenantId`: `ExchangeRateSnapshot` already covers the
-- tenant-scoped case and requires a real Tenant FK, which a platform rate has no
-- honest value for.

-- CreateTable
CREATE TABLE "PlatformExchangeRate" (
    "id" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "quoteCurrency" TEXT NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "source" "ExchangeRateSource" NOT NULL DEFAULT 'API',
    "provider" TEXT,
    "fetchedAt" TIMESTAMP(3),
    "manualOverride" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "PlatformExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformExchangeRate_baseCurrency_idx" ON "PlatformExchangeRate"("baseCurrency");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformExchangeRate_baseCurrency_quoteCurrency_key" ON "PlatformExchangeRate"("baseCurrency", "quoteCurrency");
