CREATE TYPE "UserInvitationStatus" AS ENUM ('PENDING', 'CONSUMED', 'REVOKED', 'EXPIRED');

CREATE TABLE "UserInvitation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeId" TEXT,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "status" "UserInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,

    CONSTRAINT "UserInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserInvitation_tokenHash_key" ON "UserInvitation"("tokenHash");
CREATE INDEX "UserInvitation_tenantId_idx" ON "UserInvitation"("tenantId");
CREATE INDEX "UserInvitation_userId_idx" ON "UserInvitation"("userId");
CREATE INDEX "UserInvitation_employeeId_idx" ON "UserInvitation"("employeeId");
CREATE INDEX "UserInvitation_tenantId_email_idx" ON "UserInvitation"("tenantId", "email");
CREATE INDEX "UserInvitation_tenantId_userId_status_idx" ON "UserInvitation"("tenantId", "userId", "status");
CREATE INDEX "UserInvitation_expiresAt_status_idx" ON "UserInvitation"("expiresAt", "status");

ALTER TABLE "UserInvitation" ADD CONSTRAINT "UserInvitation_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserInvitation" ADD CONSTRAINT "UserInvitation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserInvitation" ADD CONSTRAINT "UserInvitation_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
