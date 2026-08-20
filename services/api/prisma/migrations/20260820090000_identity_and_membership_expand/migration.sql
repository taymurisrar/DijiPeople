-- Identity: one person, across every workspace they belong to.
--
-- Before this, User was @@unique([tenantId, email]) with a required tenantId, so
-- the same person in two workspaces was two rows with two passwords. Generic
-- login, workspace discovery and switching were not unbuilt — they were
-- impossible by construction. See ITEM-0062.
--
-- EXPAND PHASE. Everything here is additive and nullable:
--
--   * User.identityId is nullable, so this applies to a populated database
--     without a backfill having run first;
--   * the credential columns are duplicated rather than moved, so
--     authentication keeps reading User.passwordHash until the auth split
--     lands;
--   * nothing is dropped.
--
-- The backfill is a separate migration (WP-03) and the contract phase — making
-- identityId required and removing the duplicated credentials from User — is a
-- third (WP-09), in a later deployment. Doing it in one step would make this
-- unrunnable against production.
--
-- HAND-WRITTEN, and that needs saying. `prisma migrate dev` and
-- `prisma migrate diff` both emit ~196 statements of pre-existing drift
-- alongside the real change (ITEM-0060), so a generated script here would
-- silently rename 55 indexes on production. This file contains only the
-- intended change; `prisma validate` passes and the result is verified against
-- a database built from the full migration history.

-- CreateEnum
--
-- Deliberately separate from UserStatus. User.status answers "is this account
-- usable in this tenant" and stays per tenant — somebody disabled at one
-- workspace stays disabled there while active at another. This answers "may
-- these credentials be used anywhere", which is the only question a global
-- lockout can ask.
CREATE TYPE "IdentityStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "Identity" (
    "id" TEXT NOT NULL,
    -- Normalised by normalizeEmail — trimmed and lowercased — which is what the
    -- login path has always done before looking a user up. The global unique is
    -- only safe because that normalisation already exists.
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordChangedAt" TIMESTAMP(3),
    "emailVerifiedAt" TIMESTAMP(3),
    "status" "IdentityStatus" NOT NULL DEFAULT 'ACTIVE',
    -- Lockout is global because credentials are. Per-tenant lockout would give
    -- an attacker a fresh allowance of attempts for every workspace an address
    -- belongs to, which is the opposite of what a lockout is for.
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    -- Advisory. A stale or revoked value falls back to the picker.
    "lastUsedTenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Identity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Identity_email_key" ON "Identity"("email");

-- CreateIndex
CREATE INDEX "Identity_lastUsedTenantId_idx" ON "Identity"("lastUsedTenantId");

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "identityId" TEXT;

-- CreateIndex
--
-- Workspace discovery reads this: "which tenants does this identity reach".
CREATE INDEX "User_identityId_idx" ON "User"("identityId");

-- AddForeignKey
--
-- SetNull, not Cascade: deleting a tenant must clear a stale preference, never
-- delete the person who happened to be looking at it last.
ALTER TABLE "Identity" ADD CONSTRAINT "Identity_lastUsedTenantId_fkey" FOREIGN KEY ("lastUsedTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
--
-- Restrict, not Cascade: deleting an identity while workspace accounts still
-- point at it would leave those accounts unauthenticatable rather than
-- cleaning anything up. Remove the users first, deliberately.
ALTER TABLE "User" ADD CONSTRAINT "User_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "Identity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
