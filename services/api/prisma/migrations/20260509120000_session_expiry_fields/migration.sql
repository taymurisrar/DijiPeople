-- Add traceable/sliding session metadata to persisted refresh tokens.
ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;
ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "absoluteExpiresAt" TIMESTAMP(3);
ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "lastActivityAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "RefreshToken_sessionId_idx" ON "RefreshToken"("sessionId");
