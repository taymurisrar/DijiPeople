-- Harden tenant slug data before enforcing the application contract at the database layer.
-- Existing installations already have Tenant.slug as required and unique; this migration
-- normalizes any legacy values that predate the stricter onboarding rules.

WITH normalized AS (
  SELECT
    id,
    COALESCE(
      NULLIF(
        LEFT(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              REGEXP_REPLACE(LOWER(TRIM(slug)), '[^a-z0-9]+', '-', 'g'),
              '-{2,}',
              '-',
              'g'
            ),
            '(^-+|-+$)',
            '',
            'g'
          ),
          50
        ),
        ''
      ),
      'tenant-' || LEFT(REPLACE(id::text, '-', ''), 12)
    ) AS base_slug
  FROM "Tenant"
),
deduped AS (
  SELECT
    id,
    CASE
      WHEN ROW_NUMBER() OVER (PARTITION BY base_slug ORDER BY id) = 1 THEN base_slug
      ELSE LEFT(base_slug, 50) || '-' || ROW_NUMBER() OVER (PARTITION BY base_slug ORDER BY id)
    END AS next_slug
  FROM normalized
)
UPDATE "Tenant"
SET "slug" = deduped.next_slug
FROM deduped
WHERE "Tenant"."id" = deduped.id
  AND "Tenant"."slug" <> deduped.next_slug;

UPDATE "Tenant"
SET "slug" = 'tenant-' || LEFT(REPLACE("id"::text, '-', ''), 12)
WHERE "slug" IN (
  'admin', 'api', 'app', 'auth', 'dashboard', 'login', 'logout',
  'settings', 'signup', 'www', 'dijipeople', 'tenant', 'tenants',
  'system', 'platform', 'portal', 'support', 'help', 'docs', 'billing',
  'account', 'accounts', 'root', 'superadmin'
);

CREATE INDEX IF NOT EXISTS "Tenant_slug_idx" ON "Tenant"("slug");

ALTER TABLE "Tenant"
  ADD CONSTRAINT "Tenant_slug_format_check"
  CHECK (
    "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND length("slug") BETWEEN 3 AND 63
    AND "slug" NOT LIKE '%--%'
    AND "slug" NOT IN (
      'admin', 'api', 'app', 'auth', 'dashboard', 'login', 'logout',
      'settings', 'signup', 'www', 'dijipeople', 'tenant', 'tenants',
      'system', 'platform', 'portal', 'support', 'help', 'docs', 'billing',
      'account', 'accounts', 'root', 'superadmin'
    )
  );
