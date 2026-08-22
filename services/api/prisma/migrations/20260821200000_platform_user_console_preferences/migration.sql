-- Personal console preferences for a platform user.
--
-- Hand-written rather than generated, for the reason recorded on
-- 20260820140000: `prisma migrate dev` would fold in the pre-existing
-- schema/migration drift tracked as ITEM-0060, which has nothing to do with
-- this change and must not ride along with it.
--
-- Additive and non-destructive. Three nullable columns and two enums; no
-- backfill, no constraint change, nothing read or moved.

-- ---------------------------------------------------------------------------
-- Nullable on purpose.
--
-- "Has not chosen" and "chose the current default" are different states. A null
-- follows the platform default if that default ever changes; a stored value
-- keeps what the person actually picked. Defaulting the column would collapse
-- the two and silently freeze every existing operator on today's default.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlatformUiTheme') THEN
    CREATE TYPE "PlatformUiTheme" AS ENUM ('SYSTEM', 'LIGHT', 'DARK');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlatformUiDensity') THEN
    CREATE TYPE "PlatformUiDensity" AS ENUM ('COMFORTABLE', 'COMPACT');
  END IF;
END
$$;

ALTER TABLE "PlatformUser"
  ADD COLUMN IF NOT EXISTS "uiTheme" "PlatformUiTheme",
  ADD COLUMN IF NOT EXISTS "uiDensity" "PlatformUiDensity",
  -- A route this application owns, validated against a fixed list in the DTO
  -- rather than stored as free text. A preference that accepted any string
  -- would be an open redirect wearing a settings form.
  ADD COLUMN IF NOT EXISTS "defaultLandingRoute" TEXT;
