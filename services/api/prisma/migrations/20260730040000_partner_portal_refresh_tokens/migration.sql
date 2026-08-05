CREATE TABLE "PartnerRefreshToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "replacedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerRefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartnerRefreshToken_tokenHash_key" ON "PartnerRefreshToken"("tokenHash");
CREATE INDEX "PartnerRefreshToken_userId_expiresAt_idx" ON "PartnerRefreshToken"("userId", "expiresAt");

ALTER TABLE "PartnerRefreshToken"
ADD CONSTRAINT "PartnerRefreshToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "PartnerPortalUser"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
