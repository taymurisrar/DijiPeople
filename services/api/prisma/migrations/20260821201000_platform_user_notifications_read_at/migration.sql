-- When an operator last read their notifications.
--
-- Separate from 20260821200000 because that migration is already applied, and
-- an applied migration is never edited. Additive, nullable, no backfill.
--
-- Unread is derived from this timestamp rather than stored per event. The feed
-- is a projection of `PlatformEvent` — rows nothing owns per-user — so a read
-- receipt table would mean a write per event per operator to answer a count
-- that one comparison answers. A null means "never opened it", which correctly
-- reads as "everything is unread".
ALTER TABLE "PlatformUser"
  ADD COLUMN IF NOT EXISTS "notificationsReadAt" TIMESTAMP(3);
