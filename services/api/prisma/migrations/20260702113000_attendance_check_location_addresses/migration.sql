ALTER TABLE "AttendanceEntry"
ADD COLUMN IF NOT EXISTS "checkInAddressText" TEXT,
ADD COLUMN IF NOT EXISTS "checkOutAddressText" TEXT;
