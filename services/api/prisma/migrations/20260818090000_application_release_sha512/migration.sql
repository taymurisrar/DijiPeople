-- BUG-0034: electron-updater verifies downloads against SHA-512 and refuses to
-- install on a mismatch, so the existing checksumSha256 cannot serve its feed.
-- Additive and nullable: existing releases keep working and the feed skips any
-- release without a sha512 rather than advertising one the updater would reject.
ALTER TABLE "ApplicationRelease" ADD COLUMN "checksumSha512" TEXT;
