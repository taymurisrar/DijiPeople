-- BUG-1305 — separate the priority band from the alphabetical index in
-- "Country"."sortOrder".
--
-- Two writers had been filling the same range. The ISO import numbered all 250
-- countries 0..249 by alphabetical position; DEFAULT_COUNTRIES separately gave
-- the eight priority markets 10, 20, .. 80 as ranks. They overlapped, so
-- "United States" (10) tied with "Argentina" (10) and, with the
-- [sortOrder asc, name asc] ordering, rendered between Argentina and Armenia.
-- Eight values were held by two rows each; the eight most commercially
-- important markets were the ones scattered.
--
-- After this migration the column means exactly one thing: how far up the list
-- a country is pinned.
--
--   negative  -> pinned, in the given order (the eight markets we sell to)
--   0         -> not pinned; ordering falls through to the name tiebreak
--
-- Data-only and non-destructive: no column is added, dropped or retyped, and
-- no row is deleted. `sortOrder` is a presentation rank with no foreign keys
-- and no uniqueness constraint, so rewriting it cannot orphan anything.
--
-- Ordering note: the reset runs first and the pin second, so a country that is
-- both ISO-imported and in the priority set ends up pinned rather than zeroed,
-- regardless of which value it held before.

-- 1. Everything loses its alphabetical index. `name ASC` already orders these.
UPDATE "Country" SET "sortOrder" = 0 WHERE "sortOrder" <> 0;

-- 2. The eight priority markets take the negative band, matching
--    DEFAULT_COUNTRIES in services/api/src/modules/lookups/lookups.catalog.ts.
--    Kept in step with that array; if one changes, change the other.
UPDATE "Country" SET "sortOrder" = -8 WHERE "code" = 'US';
UPDATE "Country" SET "sortOrder" = -7 WHERE "code" = 'SA';
UPDATE "Country" SET "sortOrder" = -6 WHERE "code" = 'PK';
UPDATE "Country" SET "sortOrder" = -5 WHERE "code" = 'QA';
UPDATE "Country" SET "sortOrder" = -4 WHERE "code" = 'AE';
UPDATE "Country" SET "sortOrder" = -3 WHERE "code" = 'IN';
UPDATE "Country" SET "sortOrder" = -2 WHERE "code" = 'GB';
UPDATE "Country" SET "sortOrder" = -1 WHERE "code" = 'CA';
